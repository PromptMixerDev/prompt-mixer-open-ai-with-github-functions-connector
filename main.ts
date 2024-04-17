import OpenAI from 'openai';
import { config } from './config.js';
import { ChatCompletion } from 'openai/resources';

import fetch from 'node-fetch';

const API_KEY = 'API_KEY';
const GH_TOKEN = 'GH_TOKEN';

interface Message {
  role: string;
  content: string;
  tool_call_id?: string | null;
  name?: string | null;
}

interface Completion {
  Content: string | null;
  Error?: string | undefined;
  TokenUsage: number | undefined;
  ToolCalls?: any; // Add this line to include tool calls
}

interface ConnectorResponse {
  Completions: Completion[];
  ModelType: string;
}

interface ErrorCompletion {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error: string;
  model: string;
  usage: undefined;
}

type GitHubFunction = (...args: any[]) => Promise<any>;

interface AvailableFunctions {
  [key: string]: GitHubFunction;
}

const mapToResponse = (
  outputs: Array<ChatCompletion | ErrorCompletion>,
  model: string,
): ConnectorResponse => {
  return {
    Completions: outputs.map((output) => {
      if ('error' in output) {
        return {
          Content: null,
          TokenUsage: undefined,
          Error: output.error,
        };
      } else {
        return {
          Content: output.choices[0]?.message?.content,
          TokenUsage: output.usage?.total_tokens,
        };
      }
    }),
    ModelType: outputs[0].model || model,
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapErrorToCompletion = (error: any, model: string): ErrorCompletion => {
  const errorMessage = error.message || JSON.stringify(error);
  return {
    choices: [],
    error: errorMessage,
    model,
    usage: undefined,
  };
};

async function fetchFromGitHub(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      "Accept": "application/vnd.github.v3.diff",
    }
  });
  if (!response.ok) {
    throw new Error('GitHub API request failed: ' + response.statusText);
  }
  const data = await response.json();

  return JSON.stringify(data);
}

// Function to get user data
async function getUserData(token: string, username: string) {
  const url = `https://api.github.com/users/${username}`;
  return fetchFromGitHub(url, token);
}

// Function to get repository data for the user
async function getRepositoryData(token: string, username: string) {
  const url = `https://api.github.com/users/${username}/repos`;
  return fetchFromGitHub(url, token);
}

// Function to get commit history for a specific repository
async function getCommitHistory(token: string, username: string, repoName: string) {
  const url = `https://api.github.com/repos/${username}/${repoName}/commits`;
  return fetchFromGitHub(url, token);
}

// Function to get diff from a pull request
async function getPullRequestDiff(token: string, username: string, repoName: string, pullRequestNumber: number) {
  const url = `https://api.github.com/repos/${username}/${repoName}/pulls/${pullRequestNumber}/files`;
  return fetchFromGitHub(url, token);
}


async function main(
  model: string,
  prompts: string[],
  properties: Record<string, unknown>,
  settings: Record<string, unknown>,
) {
  const openai = new OpenAI({
    apiKey: settings?.[API_KEY] as string,
  });

  const gh_token = settings?.[GH_TOKEN] as string;

  const total = prompts.length;
  const { prompt, ...restProperties } = properties;
  const systemPrompt = (prompt ||
    config.properties.find((prop) => prop.id === 'prompt')?.value) as string;
  const messageHistory: Message[] = [{ role: 'system', content: systemPrompt }];
  const outputs: Array<ChatCompletion | ErrorCompletion> = [];

  const tools = [
    {
      "type": "function",
      "function": {
        "name": "getUserData",
        "description": "Fetch user data from GitHub",
        "parameters": {
          "type": "object",
          "properties": {
            "username": {
              "type": "string",
              "description": "The GitHub username of the user"
            },
            "token": {
              "type": "string",
              "description": "The access token for GitHub API authentication"
            }
          },
          "required": ["username", "token"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "getRepositoryData",
        "description": "Fetch repository data for a user from GitHub",
        "parameters": {
          "type": "object",
          "properties": {
            "username": {
              "type": "string",
              "description": "The GitHub username of the user whose repositories are to be fetched"
            },
            "token": {
              "type": "string",
              "description": "The access token for GitHub API authentication"
            }
          },
          "required": ["username", "token"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "getCommitHistory",
        "description": "Fetch the commit history for a specific repository from GitHub",
        "parameters": {
          "type": "object",
          "properties": {
            "username": {
              "type": "string",
              "description": "The GitHub username of the repository owner"
            },
            "repoName": {
              "type": "string",
              "description": "The name of the repository"
            },
            "token": {
              "type": "string",
              "description": "The access token for GitHub API authentication"
            }
          },
          "required": ["username", "repoName", "token"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "getPullRequestDiff",
        "description": "Fetches the differential changes of a specific pull request from a GitHub repository.",
        "parameters": {
          "type": "object",
          "properties": {
            "username": {
              "type": "string",
              "description": "The GitHub username of the repository owner"
            },
            "repoName": {
              "type": "string",
              "description": "The name of the repository from which the pull request diff will be fetched"
            },
            "pullRequestNumber": {
              "type": "number",
              "description": "The number identifying the specific pull request"
            },
            "token": {
              "type": "string",
              "description": "Authentication token used to access the GitHub API"
            }
          },
          "required": ["username", "repoName", "pullRequestNumber", "token"]
        }
      }
    }
  ];

  try {
    for (let index = 0; index < total; index++) {
      try {
        messageHistory.push({ role: 'user', content: prompts[index] });
        const chatCompletion = await openai.chat.completions.create({
          messages: messageHistory as unknown as [],
          model,
          tools: tools.map(tool => ({ type: "function", function: tool.function })),
          tool_choice: "auto",
          ...restProperties,
        });

        const assistantResponse = chatCompletion.choices[0].message.content || 'No response.';
        messageHistory.push({ role: 'assistant', content: assistantResponse });

        console.log('Chat completion:', chatCompletion);

        // Check if the assistant's response contains a tool call
        const toolCalls = chatCompletion.choices[0].message.tool_calls;
        if (toolCalls) {
          const availableFunctions: AvailableFunctions = {
            getUserData: getUserData,
            getRepositoryData: getRepositoryData,
            getCommitHistory: getCommitHistory,
            getPullRequestDiff: getPullRequestDiff
          };
          for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;
            const functionToCall = availableFunctions[functionName];
            const functionArgs = JSON.parse(toolCall.function.arguments);
            if ('token' in functionArgs) {
              functionArgs.token = gh_token;
          }
            console.log('Function arguments:', functionArgs);
            const functionResponse = await functionToCall(
              functionArgs.token,
              functionArgs.username,
              functionArgs.repoName,
              functionArgs.pullRequestNumber,
            );
            messageHistory.push({
              tool_call_id: toolCall.id,
              role: "function",
              name: functionName,
              content: functionResponse,
            });

          }
          const secondResponse = await openai.chat.completions.create({
            model: model,
            messages: messageHistory as unknown as [],
            ...restProperties,
          });
          const secondAssistantResponse = secondResponse.choices[0].message.content || 'No response.';
          outputs.push(secondResponse);
          messageHistory.push({ role: 'assistant', content: secondAssistantResponse });
        } else {
          outputs.push(chatCompletion);
        }

      } catch (error) {
        console.error('Error in main loop:', error);
        const completionWithError = mapErrorToCompletion(error, model);
        outputs.push(completionWithError);
      }
    }

    return mapToResponse(outputs, model);
  } catch (error) {
    console.error('Error in main function:', error);
    return { Error: error, ModelType: model };
  }
}

export { main, config };