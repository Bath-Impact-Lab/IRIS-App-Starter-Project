import opensim
import os
import json
import jsonschema

def load_mot(path):
    # takes a path and tries to open it as a .mot file. For instance, ./subject01_walk_grf.mot
    if not os.path.exists(path):
        print(f"path {path} does not exist")
        return

    try:
        table = opensim.TimeSeriesTable(path)
        print(table)
        return table
    except Exception as e:
        print(f"failed to open file as an opensim TimeSeriesTable. error: {e}")

def save_metric_data(metric_name, metric_data: dict):
    # after checking, saves the given metric data as a json file for use in the frontend.
    
    print("loading JSON schema")

    file = open("./graph_schema.json")
    schema = json.load(file)
    file.close()


    try:
        valid = jsonschema.validate(metric_data, schema)
    except Exception as e:
        print(f"error validating json schema: {e}")    
        return

    print(f"validation successful. outputting to file.")

    with open("./test_metric.json", "w") as text_file:
        text_file.write(json.dumps(metric_data))

    return valid


if __name__ == "__main__":
    print("hello world")
    table = load_mot("./subject01_walk_grf.mot")
    print("table retrieved:")
    print(table)

    example = {
        "title": "example graph",
        "type": "line",
        "linearData": [{
            "data": [[1, 2], [3, 4], [5, 6], [7, 8]],
            "color": "red"
        }],
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

    save_metric_data("speed", example)

