"""Image boundaries and honest availability without external service doubles."""
import base64
import io
import os
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
from stellis import agents, notebooks, screen_tutor

class ScreenTutorTest(unittest.TestCase):
    def test_images_are_bounded_and_reencoded_without_metadata(self):
        output = io.BytesIO()
        Image.new("RGBA", (1600, 900), "white").save(output, format="PNG")
        encoded, width, height = screen_tutor.image_payload(output.getvalue())
        self.assertEqual((width, height), (1280, 720))
        with Image.open(io.BytesIO(base64.b64decode(encoded))) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertNotIn("exif", image.info)
        for content in (b"", b"not an image", b"x" * (screen_tutor.MAX_IMAGE_BYTES + 1)):
            with self.assertRaises(ValueError): screen_tutor.image_payload(content)
    def test_points_require_bounded_finite_coordinates_and_confidence(self):
        self.assertIsNone(screen_tutor.observation({"description":"Visible button", "point":None})["point"])
        for point in ({"x":2,"y":.5,"confidence":1,"label":"Button"},
                      {"x":float("nan"),"y":.5,"confidence":1,"label":"Button"},
                      {"x":True,"y":.5,"confidence":1,"label":"Button"},
                      {"x":.5,"y":.5,"confidence":.2,"label":"Button"}):
            self.assertIsNone(screen_tutor.observation({"description":"Visible button", "point":point})["point"])
        point={"x":.3,"y":.6,"confidence":.9,"label":"Add agent"}
        self.assertEqual(screen_tutor.observation({"description":"Visible button","point":point})["point"], {"x":.3,"y":.6,"label":"Add agent"})
    def test_cloud_and_disabled_tutor_do_not_claim_local_screen_access(self):
        with tempfile.TemporaryDirectory() as data, patch.dict(os.environ,{"STELLIS_DATA_DIR":data,"STELLIS_RUNTIME_PROFILE":"cloud","STELLIS_NEMOCLAW_SANDBOX":"local"},clear=True):
            book=notebooks.create("Learning")
            tutor=agents.deploy("tutor",book["id"])
            self.assertFalse(screen_tutor.status(tutor["id"])["configured"])
            self.assertIsNone(screen_tutor.status(tutor["id"])["vision_model"])
            with patch.dict(os.environ,{"STELLIS_RUNTIME_PROFILE":"local"}):
                self.assertTrue(screen_tutor.status(tutor["id"])["configured"])
                agents.update(tutor["id"],enabled=False)
                self.assertFalse(screen_tutor.status(tutor["id"])["configured"])
