"""Load the sample records into one account: python -m stellis.sample_records --data-dir DIR."""
import argparse
import os

parser = argparse.ArgumentParser(description="File the TCGA-Reports sample records into a notebook.")
parser.add_argument("--data-dir", required=True, help="The account's data directory, such as /data for account 1")
parser.add_argument("--notebook", default="Sample records")
arguments = parser.parse_args()
os.environ["STELLIS_DATA_DIR"] = arguments.data_dir

from stellis import sample_records  # noqa: E402  (storage reads the data directory on first use)

result = sample_records.load(arguments.notebook)
print(f"Added {result['added']} of {result['total']} sample records to notebook {result['notebook_id']}")
