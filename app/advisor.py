from __future__ import annotations

import os
from typing import Any

from app.schemas import AdviceItem, AdviceResponse, AnalyzeResponse, ResourceRecord


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _contains_cidr_anywhere_open(values: Any) -> bool:
    for value in _as_list(values):
        if str(value).strip() == "0.0.0.0/0":
            return True
    return False


def _add_advice(
    bucket: list[AdviceItem],
    *,
    rule_id: str,
    title: str,
    category: str,
    priority: str,
    resource: ResourceRecord,
    problem: str,
    suggestion: str,
    terraform_example: str | None = None,
) -> None:
    bucket.append(
        AdviceItem(
            rule_id=rule_id,
            title=title,
            category=category,
            priority=priority,
            resource_type=resource.resource_type,
            resource_name=resource.resource_name,
            file=resource.file,
            problem=problem,
            suggestion=suggestion,
            terraform_example=terraform_example,
        )
    )


def _rules_based_advice(resources: list[ResourceRecord]) -> list[AdviceItem]:
    advice: list[AdviceItem] = []

    for resource in resources:
        cfg = resource.config

        if resource.resource_type == "aws_security_group":
            for ingress in _as_list(cfg.get("ingress")):
                if _contains_cidr_anywhere_open(ingress.get("cidr_blocks")):
                    _add_advice(
                        advice,
                        rule_id="AWS.SG.OPEN_INGRESS",
                        title="Avoid open ingress from the internet",
                        category="security",
                        priority="high",
                        resource=resource,
                        problem="Security group ingress allows 0.0.0.0/0.",
                        suggestion=(
                            "Restrict ingress CIDRs to known internal ranges or trusted source IPs. "
                            "If public access is required, limit by port and add WAF/reverse proxy controls."
                        ),
                        terraform_example=(
                            'ingress {\n  cidr_blocks = ["10.0.0.0/16"]\n  from_port = 443\n  to_port = 443\n  protocol = "tcp"\n}'
                        ),
                    )

        if resource.resource_type == "aws_s3_bucket":
            acl = str(cfg.get("acl", "")).strip().lower()
            if acl in {"public-read", "public-read-write", "website"}:
                _add_advice(
                    advice,
                    rule_id="AWS.S3.PUBLIC_ACL",
                    title="Prevent public S3 ACLs",
                    category="security",
                    priority="high",
                    resource=resource,
                    problem=f"S3 ACL is public ({acl}).",
                    suggestion=(
                        "Use private ACL and enforce account-level/public-access block settings. "
                        "Serve public content through CloudFront with origin access control."
                    ),
                    terraform_example='acl = "private"',
                )

        if resource.resource_type == "aws_instance":
            if "monitoring" not in cfg:
                _add_advice(
                    advice,
                    rule_id="AWS.EC2.MONITORING",
                    title="Enable EC2 detailed monitoring",
                    category="operations",
                    priority="medium",
                    resource=resource,
                    problem="EC2 detailed monitoring is not configured.",
                    suggestion=(
                        "Enable detailed monitoring for better observability and alert quality."
                    ),
                    terraform_example="monitoring = true",
                )
            if "instance_type" in cfg and str(cfg.get("instance_type")).startswith("t2."):
                _add_advice(
                    advice,
                    rule_id="AWS.EC2.INSTANCE_FAMILY",
                    title="Consider newer generation instance families",
                    category="cost",
                    priority="low",
                    resource=resource,
                    problem="Legacy burstable family detected (t2.*).",
                    suggestion=(
                        "Evaluate t3/t4g or right-sized alternatives for improved cost/performance."
                    ),
                    terraform_example='instance_type = "t3.micro"',
                )

        if resource.resource_type == "azurerm_storage_account":
            https_only = cfg.get("enable_https_traffic_only")
            if https_only is not True:
                _add_advice(
                    advice,
                    rule_id="AZURE.STORAGE.HTTPS_ONLY",
                    title="Force HTTPS traffic for storage",
                    category="security",
                    priority="high",
                    resource=resource,
                    problem="Storage account does not explicitly enforce HTTPS-only traffic.",
                    suggestion="Set enable_https_traffic_only to true.",
                    terraform_example="enable_https_traffic_only = true",
                )

        if resource.resource_type == "google_storage_bucket":
            if cfg.get("uniform_bucket_level_access") is not True:
                _add_advice(
                    advice,
                    rule_id="GCP.GCS.UNIFORM_ACCESS",
                    title="Use uniform bucket-level access",
                    category="security",
                    priority="medium",
                    resource=resource,
                    problem="Uniform bucket-level access is not enabled.",
                    suggestion=(
                        "Enable uniform_bucket_level_access to simplify and harden access controls."
                    ),
                    terraform_example="uniform_bucket_level_access = true",
                )

    if advice:
        return advice

    # Baseline guidance so users always get actionable output in advisor mode.
    for resource in resources:
        _add_advice(
            advice,
            rule_id="GEN.BASELINE.TAGGING",
            title="Add consistent tags/labels for ownership and cost tracking",
            category="operations",
            priority="low",
            resource=resource,
            problem="No specific best-practice rule was triggered for this resource.",
            suggestion=(
                "Apply standard metadata tags (owner, environment, service, cost-center) "
                "to improve governance, automation, and reporting."
            ),
            terraform_example='tags = { owner = "platform", environment = "dev", service = "example" }',
        )

    return advice


def _llm_advice_stub(resources: list[ResourceRecord]) -> list[AdviceItem]:
    # Placeholder for later integration with an external LLM provider.
    # Keep this non-failing so the endpoint works before API keys are configured.
    if not resources:
        return []
    first = resources[0]
    return [
        AdviceItem(
            rule_id="LLM.STUB.NOT_CONFIGURED",
            title="LLM advisor is not configured yet",
            category="operations",
            priority="low",
            resource_type=first.resource_type,
            resource_name=first.resource_name,
            file=first.file,
            problem="LLM mode requested but no provider integration is wired.",
            suggestion=(
                "Configure an LLM client in app/advisor.py and pass resource graph + findings "
                "to generate contextual remediation guidance."
            ),
            terraform_example=None,
        )
    ]


def build_advice_response(analyze: AnalyzeResponse) -> AdviceResponse:
    advisor_mode = os.getenv("ADVISOR_MODE", "rules").strip().lower() or "rules"
    resources = analyze.resources

    if advisor_mode == "llm":
        advice = _llm_advice_stub(resources)
    else:
        advisor_mode = "rules"
        advice = _rules_based_advice(resources)

    summary = (
        f"Generated {len(advice)} recommendation(s) from {analyze.resource_count} resource(s) "
        f"across {len(analyze.resource_types)} resource type(s)."
    )

    return AdviceResponse(
        advisor_mode=advisor_mode,
        summary=summary,
        advice_count=len(advice),
        analyze=analyze,
        advice=advice,
    )
