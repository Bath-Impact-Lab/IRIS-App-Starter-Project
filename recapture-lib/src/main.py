import opensim
import os
import json
import jsonschema

class MetricGraph:
    """A builder class to programmatically create JSON graph schemas."""
    
    def __init__(self, title: str, graph_type: str = "line"):
        self.title = title
        self.graph_type = graph_type
        self.linear_data = []
        self.axes = {
            "x": {},
            "y": {}
        }

    def plot(self, x: list, y: list, color: str = "blue"):
        """Adds a line/dataset to the graph. Similar to plt.plot(x, y)."""
        if len(x) != len(y):
            raise ValueError("x and y arrays must be the same length")
        
        # Combine x and y into a list of coordinate pairs: [[x1, y1], [x2, y2]]
        data_points = [[x_val, y_val] for x_val, y_val in zip(x, y)]
        
        self.linear_data.append({
            "data": data_points,
            "color": color
        })

    def set_xlabel(self, title: str, unit: str = None, min_val: float = None, max_val: float = None):
        """Configures the X-axis properties."""
        self._set_axis("x", title, unit, min_val, max_val)

    def set_ylabel(self, title: str, unit: str = None, min_val: float = None, max_val: float = None):
        """Configures the Y-axis properties."""
        self._set_axis("y", title, unit, min_val, max_val)

    def _set_axis(self, axis_name: str, title: str, unit: str, min_val: float, max_val: float):
        """Helper method to populate axis data without empty keys."""
        axis_config = {"title": title}
        if unit is not None:
            axis_config["unit"] = unit
        if min_val is not None:
            axis_config["min"] = min_val
        if max_val is not None:
            axis_config["max"] = max_val
            
        self.axes[axis_name] = axis_config

    def to_dict(self) -> dict:
        """Exports the built graph to a dictionary."""
        return {
            "title": self.title,
            "type": self.graph_type,
            "linearData": self.linear_data,
            "linearAxes": self.axes
        }

    def save(self, filepath: str, schema_path: str = "./graph_schema.json") -> bool:
        """Validates the built dictionary against the schema and saves to JSON."""
        metric_data = self.to_dict()
        
        print(f"Loading JSON schema from {schema_path}")
        try:
            with open(schema_path, "r") as file:
                schema = json.load(file)
        except Exception as e:
            print(f"Failed to load schema: {e}")
            return False

        try:
            jsonschema.validate(instance=metric_data, schema=schema)
            print("Validation successful.")
        except jsonschema.exceptions.ValidationError as e:
            print(f"Error validating json schema: {e.message}")
            return False

        print(f"Outputting data to {filepath}")
        with open(filepath, "w") as text_file:
            json.dump(metric_data, text_file, indent=4) # Added indent for readability

        return True

# --- Existing OpenSim Helper ---
def load_mot(path):
    if not os.path.exists(path):
        print(f"path {path} does not exist")
        return None
    try:
        table = opensim.TimeSeriesTable(path)
        print("table retrieved:")
        print(table)
        return table
    except Exception as e:
        print(f"failed to open file as an opensim TimeSeriesTable. error: {e}")
        return None

# --- Usage Example ---
if __name__ == "__main__":
    print("hello world")
    
    # Example of loading the data
    table = load_mot("./subject01_walk_grf.mot")

    # 1. Initialize the graph
    graph = MetricGraph(title="example graph", graph_type="line")
    
    # 2. Add data (simulating passing arrays like matplotlib)
    x_data = [1, 3, 5, 7]
    y_data = [2, 4, 6, 8]
    graph.plot(x=x_data, y=y_data, color="red")
    
    # You can easily add a second line here just by calling graph.plot() again!
    # graph.plot(x=[1, 2, 3], y=[5, 5, 5], color="blue")
    
    # 3. Configure axes
    graph.set_xlabel(title="distance", unit="meters", min_val=0, max_val=100)
    graph.set_ylabel(title="time", unit="seconds", min_val=0, max_val=100)
    
    # 4. Save and validate (abstracts away your original save_metric_data function)
    graph.save("./test_metric.json")