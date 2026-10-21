"""Loads the sample records into one account.

Usage:
    python -m stellis.sample_records --data-dir DIR [--notebook NAME]
"""

import argparse
import os


def main() -> None:
    """Parses the arguments and loads the records into the account."""
    parser = argparse.ArgumentParser(
        description="File the Synthea sample records into a notebook.")
    parser.add_argument(
        "--data-dir",
        required=True,
        help="The account's data directory, such as /data for account 1")
    parser.add_argument("--notebook", default="Sample records")
    arguments = parser.parse_args()
    # storage reads the data directory from the environment on each connect.
    os.environ["STELLIS_DATA_DIR"] = arguments.data_dir
    from stellis import sample_records
    result = sample_records.load(arguments.notebook)
    print(f"Added {result['added']} of {result['total']} sample records "
          f"to notebook {result['notebook_id']}")


if __name__ == "__main__":
    main()
