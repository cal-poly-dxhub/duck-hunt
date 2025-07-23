import json
import os
import time
from typing import Any

import boto3  # type: ignore

llm_model_id = "anthropic.claude-3-5-sonnet-20240620-v1:0"
client = boto3.client(  # type: ignore
    "bedrock-runtime",
    region_name="us-west-2",
)
bedrock = boto3.client(  # type: ignore
    "bedrock",
    region_name="us-west-2",
)


def test_bedrock():
    response = bedrock.list_foundation_models()  # type: ignore
    summarries = response["modelSummaries"]  # type: ignore
    for model in summarries:  # type: ignore
        print(model["modelName"], "| model id:", model["modelId"])  # type: ignore


def invoke_llm(body: Any, modelId: str = llm_model_id, retries: int = 0) -> Any:
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


if __name__ == "__main__":
    test_bedrock()

    rb: Any = {
        "anthropic_version": "bedrock-2023-05-31",
        "messages": [{"role": "user", "content": "tell me a joke"}],
        "max_tokens": 1000,
    }
    response = invoke_llm(json.dumps(rb))

    response_body = json.loads(response["body"].read())  # type: ignore
    response_text = response_body["content"][0]["text"]
    print(response_text)
