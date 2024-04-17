# OpenAI Github Connector for Prompt Mixer
This connector includes functions to connect and retrieve information from Github using OpenAI models.

## Features
- Connect to the Github API and access various data such as repositories, issues, and user information
- Pass queries and settings to the Github API with just a few clicks
- Output is displayed directly in Prompt Mixer
- Test Github functions to ensure they work as expected

## Installation
To install:
- In Prompt Mixer go to Connectors > All Connectors
- Go to Connectors > Installed > OpenAI Github Connector to configure your OpenAI API key and Github token

## Usage
After installing and configuring your API key, you can start using the Github connector through the assistant panel in Prompt Mixer.

### Function Calling
During an API call, you can specify functions which the model will use to intelligently generate a JSON object. This object contains the necessary arguments for calling one or several functions. Note that the Chat Completions API will not execute these functions; it merely creates the JSON for you to use in your function calls within your own code.

For more details on how this works, consult the Github API documentation: https://docs.github.com/en/rest

To test your functions, please fork this repository, then add and describe your functions.

## Contributing
Pull requests and issues welcome! Let me know if you have any problems using the connector or ideas for improvements.

For guidance on building your own connector, refer to this documentation: https://docs.promptmixer.dev/tutorial-extras/create-a-custom-connector

## License
MIT