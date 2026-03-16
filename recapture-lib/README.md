Here’s a `README.md` you can use.

---

# OpenSim Metric Export Utility

This script loads an OpenSim `.mot` file as a `TimeSeriesTable` and validates/saves metric data as JSON for frontend graphing.

## What it does

* Loads a `.mot` file using `opensim.TimeSeriesTable`
* Prints the loaded table
* Validates a metric JSON object against a local JSON schema
* Writes the validated metric data to a JSON file

## Requirements

* Python 3.x
* [OpenSim Python API](https://simtk-confluence.stanford.edu/display/OpenSim/OpenSim+Documentation)
* `jsonschema`

Install `jsonschema` with:

```bash
pip install jsonschema
```

You must also have the OpenSim Python bindings installed and available in your Python environment.

## Project structure

```text
.
├── script.py
├── graph_schema.json
├── subject01_walk_grf.mot
└── test_metric.json   # created after running
```

## Usage

Run the script directly:

```bash
python script.py
```

The script will:

1. Print `"hello world"`
2. Attempt to load `./subject01_walk_grf.mot`
3. Print the retrieved OpenSim table
4. Validate the example metric object against `./graph_schema.json`
5. Save the validated output to `./test_metric.json`

## Functions

### `load_mot(path)`

Loads a `.mot` file from disk and returns it as an OpenSim `TimeSeriesTable`.

**Parameters**

* `path` (`str`): Path to the `.mot` file

**Returns**

* `opensim.TimeSeriesTable` if successful
* `None` if the file does not exist or loading fails

### `save_metric_data(metric_name, metric_data: dict)`

Validates metric data against `graph_schema.json` and writes it to `test_metric.json`.

**Parameters**

* `metric_name` (`str`): Name of the metric (currently not used in the output filename)
* `metric_data` (`dict`): Graph data to validate and save

**Returns**

* Validation result if successful
* `None` if validation fails

## Example metric format

The script currently uses this example payload:

```json
{
  "title": "example graph",
  "type": "line",
  "linearData": [
    {
      "data": [[1, 2], [3, 4], [5, 6], [7, 8]],
      "color": "red"
    }
  ],
  "linearAxes": {
    "x": {
      "unit": "meters",
      "title": "distance",
      "min": 0,
      "max": 100
    },
    "y": {
      "unit": "seconds",
      "title": "time",
      "min": 0,
      "max": 100
    }
  }
}
```

This must conform to the structure defined in `graph_schema.json`.

## Notes

* `graph_schema.json` must exist in the same directory as the script.
* `subject01_walk_grf.mot` must exist in the same directory, or you must update the file path in `__main__`.
* The output file is currently hardcoded as:

```text
./test_metric.json
``` 