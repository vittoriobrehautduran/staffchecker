#!/usr/bin/env python3
"""Clone the production API Gateway REST API into a new API for staging.

Each integration that targets timrapport-<name> is pointed at timrapport-staging-<name>
when that Lambda exists; otherwise the original ARN is kept (see printed warnings).

Re-run after deploying more staging Lambdas (LAMBDA_FUNCTION_PREFIX=timrapport-staging)
if you want additional routes to hit staging instead of production.

Requires: AWS CLI, credentials, apigateway and lambda permissions.
Optional env: SRC_API_ID, AWS_ACCOUNT_ID, AWS_REGION, NEW_API_NAME, CREATE_API=0 NEW_API_ID=... to continue a partial setup.
"""

import hashlib
import json
import os
import re
import subprocess
import sys

ACCOUNT = os.environ.get("AWS_ACCOUNT_ID", "142816256308")
REGION = os.environ.get("AWS_REGION", "eu-north-1")
SRC_API = os.environ.get("SRC_API_ID", "ywqlyoek80")


def aws_json(cmd: list[str]) -> dict:
    out = subprocess.check_output(cmd, text=True)
    return json.loads(out)


def aws_run(cmd: list[str]) -> None:
    subprocess.check_call(cmd)


def lambda_exists(function_name: str) -> bool:
    try:
        subprocess.check_output(
            [
                "aws",
                "lambda",
                "get-function",
                "--function-name",
                function_name,
                "--region",
                REGION,
            ],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return True
    except subprocess.CalledProcessError:
        return False


def extract_function_name(uri: str) -> str | None:
    if not uri:
        return None
    m = re.search(r":function:([^/]+)/invocations", uri)
    return m.group(1) if m else None


def map_to_staging_uri(uri: str) -> tuple[str, str | None, str | None]:
    if not uri or "function:timrapport-" not in uri:
        return uri, extract_function_name(uri), None
    if "function:timrapport-staging-" in uri:
        fn = extract_function_name(uri)
        return uri, fn, None
    new_uri = uri.replace("function:timrapport-", "function:timrapport-staging-", 1)
    staging_fn = extract_function_name(new_uri)
    if staging_fn and lambda_exists(staging_fn):
        return new_uri, staging_fn, None
    orig_fn = extract_function_name(uri)
    return uri, orig_fn, f"staging missing {staging_fn}, kept prod {orig_fn}"


def main() -> int:
    create = os.environ.get("CREATE_API", "1") == "1"
    if create:
        created = aws_json(
            [
                "aws",
                "apigateway",
                "create-rest-api",
                "--name",
                os.environ.get("NEW_API_NAME", "timrapport-staging-api"),
                "--description",
                "Dedicated staging API (staging Lambdas where deployed; prod fallback otherwise)",
                "--endpoint-configuration",
                "types=REGIONAL",
                "--region",
                REGION,
                "--output",
                "json",
            ]
        )
        new_api_id = created["id"]
        print(f"Created REST API id={new_api_id}", flush=True)
    else:
        new_api_id = os.environ["NEW_API_ID"]
        print(f"Using existing REST API id={new_api_id}", flush=True)

    src = aws_json(
        [
            "aws",
            "apigateway",
            "get-resources",
            "--rest-api-id",
            SRC_API,
            "--embed",
            "methods",
            "--region",
            REGION,
            "--output",
            "json",
        ]
    )
    items = {r["id"]: r for r in src["items"]}

    new_root = aws_json(
        [
            "aws",
            "apigateway",
            "get-resources",
            "--rest-api-id",
            new_api_id,
            "--region",
            REGION,
            "--output",
            "json",
        ]
    )
    new_root_id = new_root["items"][0]["id"]

    src_root = next(r for r in items.values() if r.get("path") == "/")
    id_map: dict[str, str] = {src_root["id"]: new_root_id}

    def depth(r: dict) -> int:
        return r.get("path", "/").count("/")

    rest = [r for r in items.values() if r.get("path") != "/"]
    rest.sort(key=lambda r: (depth(r), r.get("path", "")))

    for r in rest:
        old_pid = r["parentId"]
        new_pid = id_map[old_pid]
        path_part = r.get("pathPart")
        if not path_part:
            raise RuntimeError(f"No pathPart for resource {r}")
        created = aws_json(
            [
                "aws",
                "apigateway",
                "create-resource",
                "--rest-api-id",
                new_api_id,
                "--parent-id",
                new_pid,
                "--path-part",
                path_part,
                "--region",
                REGION,
                "--output",
                "json",
            ]
        )
        id_map[r["id"]] = created["id"]
        print(f"  resource {r['path']} -> {created['id']}", flush=True)

    warnings: list[str] = []
    lambdas_to_permission: set[str] = set()

    for r in items.values():
        rid = r["id"]
        new_rid = id_map[rid]
        for method in sorted(r.get("resourceMethods", {}).keys()):
            m = aws_json(
                [
                    "aws",
                    "apigateway",
                    "get-method",
                    "--rest-api-id",
                    SRC_API,
                    "--resource-id",
                    rid,
                    "--http-method",
                    method,
                    "--region",
                    REGION,
                    "--output",
                    "json",
                ]
            )
            auth_type = m.get("authorizationType", "NONE")
            cmd: list[str] = [
                "aws",
                "apigateway",
                "put-method",
                "--rest-api-id",
                new_api_id,
                "--resource-id",
                new_rid,
                "--http-method",
                method,
                "--authorization-type",
                auth_type,
                "--region",
                REGION,
            ]
            if m.get("apiKeyRequired"):
                cmd.append("--api-key-required")
            else:
                cmd.append("--no-api-key-required")
            rp = m.get("requestParameters") or {}
            if rp:
                parts = [f"{k}={str(v).lower()}" for k, v in rp.items()]
                cmd += ["--request-parameters", ",".join(parts)]
            aws_run(cmd)

            for code, mr in (m.get("methodResponses") or {}).items():
                rcmd: list[str] = [
                    "aws",
                    "apigateway",
                    "put-method-response",
                    "--rest-api-id",
                    new_api_id,
                    "--resource-id",
                    new_rid,
                    "--http-method",
                    method,
                    "--status-code",
                    code,
                    "--region",
                    REGION,
                ]
                for mk, mv in (mr.get("responseModels") or {}).items():
                    rcmd += ["--response-models", f"{mk}={mv}"]
                try:
                    aws_run(rcmd)
                except subprocess.CalledProcessError as e:
                    print(
                        f"WARN put-method-response {r.get('path')} {method} {code}: {e}",
                        flush=True,
                    )

            integ = aws_json(
                [
                    "aws",
                    "apigateway",
                    "get-integration",
                    "--rest-api-id",
                    SRC_API,
                    "--resource-id",
                    rid,
                    "--http-method",
                    method,
                    "--region",
                    REGION,
                    "--output",
                    "json",
                ]
            )
            itype = integ["type"]
            iuri = integ.get("uri") or ""
            final_uri, fn_name, warn = map_to_staging_uri(iuri)
            if warn:
                warnings.append(f"{r.get('path')} {method}: {warn}")
            if fn_name and itype == "AWS_PROXY":
                lambdas_to_permission.add(fn_name)

            icmd: list[str] = [
                "aws",
                "apigateway",
                "put-integration",
                "--rest-api-id",
                new_api_id,
                "--resource-id",
                new_rid,
                "--http-method",
                method,
                "--type",
                itype,
                "--integration-http-method",
                integ.get("httpMethod", "POST"),
                "--uri",
                final_uri,
                "--region",
                REGION,
            ]
            if integ.get("passthroughBehavior"):
                icmd += ["--passthrough-behavior", integ["passthroughBehavior"]]
            if integ.get("contentHandling"):
                icmd += ["--content-handling", integ["contentHandling"]]
            if integ.get("timeoutInMillis"):
                icmd += ["--timeout-in-millis", str(integ["timeoutInMillis"])]
            for k, v in (integ.get("requestParameters") or {}).items():
                icmd += ["--request-parameters", f"{k}={v}"]
            aws_run(icmd)

            if itype != "AWS_PROXY":
                for code, ir in (integ.get("integrationResponses") or {}).items():
                    ircmd: list[str] = [
                        "aws",
                        "apigateway",
                        "put-integration-response",
                        "--rest-api-id",
                        new_api_id,
                        "--resource-id",
                        new_rid,
                        "--http-method",
                        method,
                        "--status-code",
                        code,
                        "--region",
                        REGION,
                    ]
                    for tk, tv in (ir.get("responseTemplates") or {}).items():
                        if tv is None:
                            continue
                        ircmd += ["--response-templates", f"{tk}={tv}"]
                    if len(ircmd) > 12:
                        aws_run(ircmd)

    print("\nWarnings (integrations still on prod or missing staging):", flush=True)
    for w in warnings:
        print(" ", w, flush=True)

    print(f"\nAdding Lambda invoke permissions for {len(lambdas_to_permission)} functions", flush=True)
    src_arn = f"arn:aws:execute-api:{REGION}:{ACCOUNT}:{new_api_id}/*/*/*"
    for fn in sorted(lambdas_to_permission):
        if not lambda_exists(fn):
            print(
                f"  {fn} skip add-permission (Lambda does not exist in this account/region)",
                flush=True,
            )
            continue
        sid = "apigw-" + hashlib.sha256((new_api_id + fn).encode()).hexdigest()[:40]
        p = subprocess.run(
            [
                "aws",
                "lambda",
                "add-permission",
                "--function-name",
                fn,
                "--statement-id",
                sid,
                "--action",
                "lambda:InvokeFunction",
                "--principal",
                "apigateway.amazonaws.com",
                "--source-arn",
                src_arn,
                "--region",
                REGION,
            ],
            capture_output=True,
            text=True,
        )
        if p.returncode == 0:
            print(f"  {fn} OK", flush=True)
        else:
            err = (p.stderr or "") + (p.stdout or "")
            if "ResourceConflictException" in err or "already exists" in err.lower():
                print(f"  {fn} (permission already present)", flush=True)
            else:
                print(f"  {fn} FAILED {err[:300]}", flush=True)

    deploy = aws_json(
        [
            "aws",
            "apigateway",
            "create-deployment",
            "--rest-api-id",
            new_api_id,
            "--stage-name",
            "prod",
            "--description",
            "Staging API (cloned from prod + staging Lambdas)",
            "--region",
            REGION,
            "--output",
            "json",
        ]
    )
    print("\nDeployment id:", deploy.get("id"), flush=True)
    print("\nVITE_API_BASE_URL for staging:", flush=True)
    print(f"https://{new_api_id}.execute-api.{REGION}.amazonaws.com/prod", flush=True)
    print("\nNEW_API_ID=" + new_api_id, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
