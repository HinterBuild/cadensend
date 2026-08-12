"""Process-wide Python startup customization for the AI engine."""

import warnings

warnings.filterwarnings(
    "ignore",
    message=r"The default value of `allowed_objects` will change in a future version\..*",
)
