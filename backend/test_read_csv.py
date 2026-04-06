import os
import pandas as pd

base_dir = os.path.dirname(os.path.abspath(__file__))
csv_path = os.path.join(base_dir, "data", "us_accidents_small.csv")
print("Path:", csv_path)

df = pd.read_csv(
    csv_path,
    sep=",",
    engine="python",
    on_bad_lines="skip"
)
print("Columns:", df.columns.tolist())
print("Shape:", df.shape)