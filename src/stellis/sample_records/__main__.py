"""Loads the sample records into one account.

Usage:
    python -m stellis.sample_records --data-dir DIR [--notebook NAME]
"""

import argparse
import os


def main() -> None:
    """Parses the arguments and loads the records into the account."""
    parser = argparse.ArgumentParser(
        description="Upload Denver Lang's sample records into one account.")
    parser.add_argument(
        "--data-dir",
        required=True,
        help="The account's data directory, such as /data for account 1")
    parser.add_argument(
        "--notebook",
        help="File every record in this notebook instead of leaving them "
        "unsorted")
    arguments = parser.parse_args()
    # storage reads the data directory from the environment on each connect.
    os.environ["STELLIS_DATA_DIR"] = arguments.data_dir
    from stellis import sample_records
    result = sample_records.load(arguments.notebook)
    where = (f"notebook {result['notebook_id']}"
             if result["notebook_id"] else "no notebook")
    print(f"Added {result['added']} of {result['total']} sample records "
          f"to {where}")


if __name__ == "__main__":
    main()
