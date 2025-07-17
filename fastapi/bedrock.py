import json
import os
import time
from typing import Any

import boto3  # type: ignore
from dotenv import load_dotenv  # type: ignore

load_dotenv()


embedding_model_id = "amazon.titan-embed-text-v2:0"
llm_model_id = "anthropic.claude-3-5-sonnet-20240620-v1:0"
client = boto3.client(  # type: ignore
    "bedrock-runtime",
    region_name="us-west-2",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
)
bedrock = boto3.client(  # type: ignore
    "bedrock",
    region_name="us-west-2",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
)


def test_bedrock():
    response = bedrock.list_foundation_models()  # type: ignore
    summarries = response["modelSummaries"]  # type: ignore
    for model in summarries:  # type: ignore
        print(model["modelName"], "| model id:", model["modelId"])  # type: ignore


def invoke_llm(body: Any, modelId: str = llm_model_id, retries: int = 0) -> Any:
    # print("invoking llm, retries:", retries)
    try:
        # raise Exception("(ThrottlingException)")  # For testing
        return client.invoke_model(modelId=modelId, body=body)  # type: ignore
    except Exception as e:
        if "(ThrottlingException)" in str(e) and retries < 3:
            time.sleep((retries + 1) * 8)
            return invoke_llm(
                body,
                modelId,
                retries + 1,
            )

        print("ERROR: ERROR INVOKING LLM:", e)
        raise Exception(f"Error invoking LLM ({e})")


# def invoke_embedding(body: Any, retries: int = 0) -> Any:
#     # print("invoking embedding, retries:", retries)
#     try:
#         return client.invoke_model(modelId=embedding_model_id, body=body)  # type: ignore
#     except Exception as e:
#         if "(ThrottlingException)" in str(e) and retries < 3:
#             time.sleep((retries + 1) * 8)
#             return invoke_embedding(
#                 body,
#                 retries + 1,
#             )
#         print(e)
#         exit(1)


if __name__ == "__main__":
    # test_bedrock()

    # -----------------

    rb: Any = {
        "anthropic_version": "bedrock-2023-05-31",
        "messages": [{"role": "user", "content": "tell me a joke"}],
        "max_tokens": 1000,
    }
    response = invoke_llm(json.dumps(rb))

    response_body = json.loads(response["body"].read())  # type: ignore
    response_text = response_body["content"][0]["text"]
    print(response_text)
