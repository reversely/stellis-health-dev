"""Model setup verifies archives and refuses unsafe repeat downloads."""

import hashlib
import io
import tarfile
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts import install_live_asr_models


class LiveAsrInstallerTest(unittest.TestCase):
    def test_verified_archives_extract_and_leave_no_temporary_copy(self) -> None:
        archives = {}
        models = []
        for name, _ in install_live_asr_models.MODELS:
            output = io.BytesIO()
            with tarfile.open(fileobj=output, mode="w:bz2") as bundle:
                for choices in install_live_asr_models.REQUIRED_FILES[name]:
                    content = b"sample model file"
                    info = tarfile.TarInfo(f"{name}/{choices[0]}")
                    info.size = len(content)
                    bundle.addfile(info, io.BytesIO(content))
            archive = output.getvalue()
            archives[name] = archive
            models.append((name, hashlib.sha256(archive).hexdigest()))

        def open_archive(url: str, timeout: int) -> io.BytesIO:
            self.assertEqual(timeout, 90)
            name = url.rsplit("/", 1)[-1].removesuffix(".tar.bz2")
            return io.BytesIO(archives[name])

        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            with patch.object(install_live_asr_models, "MODELS", tuple(models)), \
                 patch.object(install_live_asr_models.shutil, "disk_usage",
                              return_value=SimpleNamespace(free=6 * 1024**3)), \
                 patch.object(install_live_asr_models.urllib.request, "urlopen",
                              side_effect=open_archive) as download:
                with redirect_stdout(io.StringIO()):
                    install_live_asr_models.install(root)
            self.assertEqual(download.call_count, 2)
            self.assertEqual({item.name for item in root.iterdir()}, set(archives))
            for name in archives:
                self.assertTrue(install_live_asr_models._complete(name, root / name))

    def test_bad_checksum_removes_temporary_archive(self) -> None:
        name = install_live_asr_models.MODELS[0][0]
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            with patch.object(install_live_asr_models, "MODELS", ((name, "0" * 64),)), \
                 patch.object(install_live_asr_models.shutil, "disk_usage",
                              return_value=SimpleNamespace(free=6 * 1024**3)), \
                 patch.object(install_live_asr_models.urllib.request, "urlopen",
                              return_value=io.BytesIO(b"not the pinned archive")):
                with redirect_stdout(io.StringIO()):
                    with self.assertRaisesRegex(RuntimeError, "Model checksum failed"):
                        install_live_asr_models.install(root)
            self.assertEqual(list(root.iterdir()), [])

    def test_partial_directory_is_rejected_without_network(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            partial = root / install_live_asr_models.MODELS[0][0]
            partial.mkdir()
            (partial / "tokens.txt").write_text("sample")
            with patch.object(install_live_asr_models.urllib.request, "urlopen",
                              side_effect=AssertionError("unexpected download")):
                with self.assertRaisesRegex(RuntimeError, "Incomplete model directory"):
                    with redirect_stdout(io.StringIO()):
                        install_live_asr_models.install(root)

    def test_complete_directories_do_not_download_again(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            for name, _ in install_live_asr_models.MODELS:
                folder = root / name
                folder.mkdir()
                for choices in install_live_asr_models.REQUIRED_FILES[name]:
                    (folder / choices[0]).write_text("sample")
            with patch.object(install_live_asr_models.urllib.request, "urlopen",
                              side_effect=AssertionError("unexpected download")):
                with redirect_stdout(io.StringIO()):
                    install_live_asr_models.install(root)

    def test_low_space_is_rejected_without_network(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            with patch.object(install_live_asr_models.shutil, "disk_usage",
                              return_value=SimpleNamespace(free=1024)), \
                 patch.object(install_live_asr_models.urllib.request, "urlopen",
                              side_effect=AssertionError("unexpected download")):
                with self.assertRaisesRegex(RuntimeError, "5 GiB free"):
                    with redirect_stdout(io.StringIO()):
                        install_live_asr_models.install(Path(temp_name))


if __name__ == "__main__":
    unittest.main()
