import os
import json
from flask import Blueprint, jsonify, request

reports_bp = Blueprint("reports", __name__)

@reports_bp.post("/reports/executive-summary")
def generate_executive_summary():
    payload = request.get_json(silent=True) or {}
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    model = os.getenv("GEMINI_MODEL")
    sections = payload.get("sections") or []

    if not api_key:
        return jsonify({"error": "GEMINI_API_KEY is not configured on the backend."}), 503
    if not model:
        return jsonify({"error": "GEMINI_MODEL is not configured on the backend."}), 503
    if not sections:
        return jsonify({"error": "At least one report section is required."}), 400

    evidence = json.dumps({
        "title": payload.get("title", ""),
        "scope": payload.get("scope", ""),
        "project_code": payload.get("projectCode", ""),
        "project_name": payload.get("projectName", ""),
        "filters": payload.get("filters", {}),
        "sections": sections,
    }, ensure_ascii=False, default=str)

    if len(evidence) > 50000:
        evidence = evidence[:50000] + "\n[Evidence truncated for model context.]"

    prompt = """You are the PAIMANA reporting assistant.
Create a factual executive summary from the supplied report evidence only.
Do not invent values, causes, dates, recommendations or project facts.
Use exactly these headings:
1. Key Findings
2. Major Risks
3. Important Changes / Trends
4. Recommended Actions
Keep it concise and suitable for an official infrastructure monitoring report.
If evidence is unavailable for a heading, state that it is not available in the selected sections.

REPORT EVIDENCE:
""" + evidence

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        interaction = client.interactions.create(model=model, input=prompt, store=False)
        summary = interaction.output_text or ""
        if not summary:
            return jsonify({"error": "Gemini returned an empty summary."}), 502
        return jsonify({"summary": summary})
    except Exception as exc:
        return jsonify({"error": f"Executive summary generation failed: {exc}"}), 502
