const state = {
  mode: "file",
  resources: [],
  security: null,
};

const modeButtons = document.querySelectorAll(".mode-btn");
const form = document.getElementById("analyze-form");
const exportForm = document.getElementById("export-form");
const fileInput = document.getElementById("iac-input");
const fileLabel = document.getElementById("file-label");
const statusEl = document.getElementById("status");
const exportLogEl = document.getElementById("export-log");
const summaryPanel = document.getElementById("summary-panel");
const diagramPanel = document.getElementById("diagram-panel");
const securityPanel = document.getElementById("security-panel");
const tablePanel = document.getElementById("table-panel");
const resourceCountEl = document.getElementById("resource-count");
const typeCountEl = document.getElementById("type-count");
const chipsEl = document.getElementById("chips");
const diagramEl = document.getElementById("diagram");
const securityScoreEl = document.getElementById("security-score");
const securitySummaryEl = document.getElementById("security-summary");
const securityFindingsBody = document.getElementById("security-findings-body");
const tableBody = document.getElementById("resource-table-body");
const filterInput = document.getElementById("table-filter");
const analyzeSecurityCheckbox = document.getElementById("analyze-security");
const exporterInput = document.getElementById("exporter");
const subscriptionInput = document.getElementById("subscription-id");
const scopeTypeSelect = document.getElementById("scope-type");
const scopeValueInput = document.getElementById("scope-value");
const outputDirInput = document.getElementById("output-dir");
const exportFolderSelect = document.getElementById("export-folder-select");
const appendCheckbox = document.getElementById("append");
const nonInteractiveCheckbox = document.getElementById("non-interactive");
const hclOnlyCheckbox = document.getElementById("hcl-only");
const deviceCodeCheckbox = document.getElementById("device-code");
const exportSecurityCheckbox = document.getElementById("export-security");

for (const btn of modeButtons) {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
}

form.addEventListener("submit", onSubmit);
exportForm.addEventListener("submit", onExport);
filterInput.addEventListener("input", () => renderTable(state.resources, filterInput.value));

function setMode(mode) {
  state.mode = mode;

  for (const btn of modeButtons) {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  }

  if (mode === "file") {
    fileInput.accept = ".tf";
    fileLabel.textContent = "Upload .tf file";
  } else {
    fileInput.accept = ".zip";
    fileLabel.textContent = "Upload .zip folder archive";
  }

  fileInput.value = "";
}

async function onSubmit(event) {
  event.preventDefault();

  const selected = fileInput.files?.[0];
  if (!selected) {
    setStatus("Select a file before analyzing.", true);
    return;
  }

  const includeSecurity = analyzeSecurityCheckbox.checked;
  const formData = new FormData();
  let endpoint = includeSecurity ? "/security/file" : "/analyze/file";

  if (state.mode === "file") {
    formData.append("tf_file", selected);
  } else {
    endpoint = includeSecurity ? "/security/folder" : "/analyze/folder";
    formData.append("tf_folder_zip", selected);
  }

  setStatus("Analyzing Terraform resources...");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.detail || "Request failed.";
      throw new Error(message);
    }

    const { analyze, security } = normalizeAnalyzePayload(payload);

    state.resources = analyze.resources || [];
    state.security = security;
    renderSummary(analyze);
    renderDiagram(analyze.resources || []);
    renderSecurity(security);
    renderTable(analyze.resources || [], filterInput.value);

    summaryPanel.hidden = false;
    diagramPanel.hidden = false;
    tablePanel.hidden = false;

    const resourceCount = analyze.resource_count || 0;
    const typeCount = analyze.resource_types?.length || 0;
    const findingsCount = security?.findings_count || 0;
    const securityText = security ? ` Security findings: ${findingsCount}.` : "";
    setStatus(`Done. Found ${resourceCount} resources across ${typeCount} types.${securityText}`);
  } catch (error) {
    summaryPanel.hidden = true;
    diagramPanel.hidden = true;
    securityPanel.hidden = true;
    tablePanel.hidden = true;
    setStatus(`Error: ${error.message}`, true);
  }
}

async function onExport(event) {
  event.preventDefault();

  const scopeValue = scopeValueInput.value.trim();
  if (!scopeValue) {
    setExportLog("Enter a scope value before exporting.", true);
    return;
  }

  const outputDir = resolveOutputDirName();

  const payload = {
    exporter: exporterInput.value.trim() || null,
    subscription_id: subscriptionInput.value.trim() || null,
    scope_type: scopeTypeSelect.value,
    scope: scopeValue,
    output_dir: outputDir,
    append: appendCheckbox.checked,
    non_interactive: nonInteractiveCheckbox.checked,
    hcl_only: hclOnlyCheckbox.checked,
    use_device_code: deviceCodeCheckbox.checked,
    include_security: exportSecurityCheckbox.checked,
  };

  setExportLog("Running Azure export. This can take a few minutes...");

  try {
    const response = await fetch("/export/azure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      const detail = data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : detail?.message || "Export request failed.";
      const logPayload = typeof detail === "object" ? detail : { message: detail };
      setExportLog(renderCommandLog(logPayload), true);
      throw new Error(message);
    }

    setExportLog(renderCommandLog(data));
    await loadExportFolders(outputDir);

    const analyze = data.analyze || {};
    const security = data.security || null;
    state.resources = analyze.resources || [];
    state.security = security;
    renderSummary(analyze);
    renderDiagram(analyze.resources || []);
    renderSecurity(security);
    renderTable(analyze.resources || [], filterInput.value);

    summaryPanel.hidden = false;
    diagramPanel.hidden = false;
    tablePanel.hidden = false;
  } catch (error) {
    securityPanel.hidden = true;
    setExportLog(`Error: ${error.message}`, true);
  }
}

function normalizeAnalyzePayload(payload) {
  const analyze = payload?.analyze || payload || {};
  const security = payload?.security || null;
  return { analyze, security };
}

function renderSummary(payload) {
  resourceCountEl.textContent = String(payload.resource_count || 0);
  typeCountEl.textContent = String(payload.resource_types?.length || 0);

  chipsEl.innerHTML = "";
  for (const type of payload.resource_types || []) {
    const chip = document.createElement("span");
    chip.textContent = type;
    chipsEl.appendChild(chip);
  }
}

function renderDiagram(resources) {
  diagramEl.innerHTML = "";

  if (!resources.length) {
    diagramEl.textContent = "No resources found.";
    return;
  }

  const grouped = new Map();
  for (const resource of resources) {
    if (!grouped.has(resource.resource_type)) {
      grouped.set(resource.resource_type, []);
    }
    grouped.get(resource.resource_type).push(resource);
  }

  const typeNames = [...grouped.keys()].sort();
  const rightNodes = resources.map((resource, idx) => ({
    ...resource,
    y: 70 + idx * 60,
    id: `res-${idx}`,
  }));

  const typePositions = typeNames.map((name, idx) => ({
    name,
    y: 90 + idx * Math.max(90, (rightNodes.length * 60) / Math.max(1, typeNames.length)),
  }));

  const width = 1040;
  const height = Math.max(260, rightNodes.length * 62 + 80);

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", String(width));
  bg.setAttribute("height", String(height));
  bg.setAttribute("fill", "#f8fbff");
  svg.appendChild(bg);

  const typeByName = new Map(typePositions.map((x) => [x.name, x]));

  for (const res of rightNodes) {
    const source = typeByName.get(res.resource_type);
    if (!source) continue;

    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", "285");
    line.setAttribute("y1", String(source.y));
    line.setAttribute("x2", "640");
    line.setAttribute("y2", String(res.y));
    line.setAttribute("stroke", "#94a3b8");
    line.setAttribute("stroke-width", "1.2");
    svg.appendChild(line);
  }

  for (const typeNode of typePositions) {
    const g = document.createElementNS(ns, "g");

    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", "40");
    rect.setAttribute("y", String(typeNode.y - 22));
    rect.setAttribute("width", "245");
    rect.setAttribute("height", "44");
    rect.setAttribute("rx", "10");
    rect.setAttribute("fill", "#0f766e");
    rect.setAttribute("stroke", "#0a5e58");
    g.appendChild(rect);

    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", "56");
    text.setAttribute("y", String(typeNode.y + 6));
    text.setAttribute("font-size", "13");
    text.setAttribute("font-family", "Space Grotesk, sans-serif");
    text.setAttribute("fill", "#ffffff");
    text.textContent = typeNode.name;
    g.appendChild(text);

    svg.appendChild(g);
  }

  for (const res of rightNodes) {
    const g = document.createElementNS(ns, "g");

    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", "640");
    rect.setAttribute("y", String(res.y - 20));
    rect.setAttribute("width", "360");
    rect.setAttribute("height", "40");
    rect.setAttribute("rx", "10");
    rect.setAttribute("fill", "#ffffff");
    rect.setAttribute("stroke", "#d7e0ee");
    g.appendChild(rect);

    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", "654");
    text.setAttribute("y", String(res.y + 5));
    text.setAttribute("font-size", "12.5");
    text.setAttribute("font-family", "ui-monospace, Menlo, Consolas, monospace");
    text.setAttribute("fill", "#1f2937");
    const label = `${res.resource_name} (${res.file.split(/[\\/]/).pop() || res.file})`;
    text.textContent = label.length > 52 ? `${label.slice(0, 49)}...` : label;
    g.appendChild(text);

    svg.appendChild(g);
  }

  diagramEl.appendChild(svg);
}

function renderSecurity(security) {
  securityFindingsBody.innerHTML = "";

  if (!security) {
    securityPanel.hidden = true;
    return;
  }

  securityPanel.hidden = false;
  const score = Number.isFinite(security.score?.score) ? security.score.score : 100;
  securityScoreEl.textContent = `Score: ${score}`;
  securityScoreEl.className = `security-score score-${scoreBand(score)}`;
  securitySummaryEl.textContent = security.summary || "No security summary available.";

  const findings = Array.isArray(security.findings) ? security.findings : [];
  if (!findings.length) {
    const row = document.createElement("tr");
    const noData = document.createElement("td");
    noData.colSpan = 6;
    noData.textContent = "No security findings.";
    row.appendChild(noData);
    securityFindingsBody.appendChild(row);
    return;
  }

  for (const finding of findings) {
    const row = document.createElement("tr");

    const severityTd = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `sev-badge sev-${finding.severity || "low"}`;
    badge.textContent = String(finding.severity || "low").toUpperCase();
    severityTd.appendChild(badge);

    row.appendChild(severityTd);
    row.appendChild(cell(finding.source_library || "unknown"));
    row.appendChild(cell(finding.resource || `${finding.resource_type}.${finding.resource_name}`));
    row.appendChild(cell(finding.category || "n/a"));
    row.appendChild(cell(finding.issue || ""));
    row.appendChild(cell(finding.recommendation || ""));

    securityFindingsBody.appendChild(row);
  }
}

function scoreBand(score) {
  if (score >= 80) return "good";
  if (score >= 60) return "warn";
  return "risk";
}

function renderTable(resources, filterText) {
  const query = (filterText || "").trim().toLowerCase();
  const filtered = !query
    ? resources
    : resources.filter((resource) => {
        const haystack = `${resource.resource_type} ${resource.resource_name} ${resource.file}`.toLowerCase();
        return haystack.includes(query);
      });

  tableBody.innerHTML = "";

  if (!filtered.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "No matching resources.";
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  for (const resource of filtered) {
    const row = document.createElement("tr");
    row.appendChild(cell(resource.resource_type));
    row.appendChild(cell(resource.resource_name));
    row.appendChild(cell(resource.file));
    row.appendChild(suggestionCell(resource));

    const configTd = document.createElement("td");
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "View config";

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(resource.config, null, 2);

    details.appendChild(summary);
    details.appendChild(pre);
    configTd.appendChild(details);
    row.appendChild(configTd);

    tableBody.appendChild(row);
  }
}

function suggestionCell(resource) {
  const td = document.createElement("td");
  const resourceKey = `${resource.resource_type}.${resource.resource_name}`;
  const hasSecurityLoaded = Boolean(state.security);
  const findingsByResource = state.security?.findings_by_resource || {};
  const findings = findingsByResource[resourceKey] || [];

  const button = document.createElement("button");
  button.type = "button";
  button.className = "inline-action";
  if (findings.length) {
    button.textContent = `Show suggestions (${findings.length})`;
  } else if (hasSecurityLoaded) {
    button.textContent = "No suggestions";
    button.disabled = true;
  } else {
    button.textContent = "Analyze suggestions";
  }
  button.addEventListener("click", async () => {
    try {
      await ensureSecurityAnalysis();
      renderSecurity(state.security);
      renderTable(state.resources, filterInput.value);
    } catch (error) {
      setStatus(`Error: ${error.message}`, true);
    }
  });
  td.appendChild(button);

  if (findings.length) {
    const details = document.createElement("details");
    details.className = "suggestion-details";
    const summary = document.createElement("summary");
    summary.textContent = "View";
    details.appendChild(summary);

    for (const finding of findings) {
      const block = document.createElement("div");
      block.className = "suggestion-item";

      const sev = document.createElement("span");
      sev.className = `sev-badge sev-${finding.severity || "low"}`;
      sev.textContent = String(finding.severity || "low").toUpperCase();
      block.appendChild(sev);

      const issue = document.createElement("p");
      issue.className = "suggestion-line";
      issue.textContent = finding.issue || "";
      block.appendChild(issue);

      const source = document.createElement("p");
      source.className = "suggestion-line suggestion-source";
      source.textContent = `Source: ${finding.source_library || "unknown"} (${finding.rule_id || "rule"})`;
      block.appendChild(source);

      const rec = document.createElement("p");
      rec.className = "suggestion-line suggestion-recommendation";
      rec.textContent = finding.recommendation || "";
      block.appendChild(rec);

      details.appendChild(block);
    }

    td.appendChild(details);
  }

  return td;
}

async function ensureSecurityAnalysis() {
  if (state.security || !state.resources.length) {
    return;
  }

  const selected = fileInput.files?.[0];
  if (selected && state.mode === "file" && selected.name.endsWith(".tf")) {
    setStatus("Generating security suggestions...");
    const formData = new FormData();
    formData.append("tf_file", selected);
    const response = await fetch("/security/file", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.detail || "Failed to generate security suggestions.";
      throw new Error(message);
    }
    const normalized = normalizeAnalyzePayload(payload);
    state.resources = normalized.analyze.resources || state.resources;
    state.security = normalized.security;
    setStatus(`Done. Security findings: ${state.security?.findings_count || 0}.`);
    return;
  }

  if (selected && state.mode === "folder" && selected.name.endsWith(".zip")) {
    setStatus("Generating security suggestions...");
    const formData = new FormData();
    formData.append("tf_folder_zip", selected);
    const response = await fetch("/security/folder", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.detail || "Failed to generate security suggestions.";
      throw new Error(message);
    }
    const normalized = normalizeAnalyzePayload(payload);
    state.resources = normalized.analyze.resources || state.resources;
    state.security = normalized.security;
    setStatus(`Done. Security findings: ${state.security?.findings_count || 0}.`);
    return;
  }

  setStatus("Generating security suggestions...");
  const response = await fetch("/security/resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resources: state.resources,
      scan_dir: inferScanDirFromResources(state.resources),
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.detail || "Failed to generate security suggestions.";
    throw new Error(message);
  }

  state.security = payload;
  setStatus(
    `Done. Security findings: ${payload.findings_count || 0}.`
  );
}

function inferScanDirFromResources(resources) {
  if (!Array.isArray(resources) || !resources.length) {
    return null;
  }

  const windowsAbsolute = /^[a-zA-Z]:\\/;
  const unixAbsolute = /^\//;
  const files = resources.map((r) => String(r.file || ""));
  if (!files.every((f) => windowsAbsolute.test(f) || unixAbsolute.test(f))) {
    return null;
  }

  const normalize = (file) => file.replace(/\\/g, "/");
  const dirs = files.map((f) => {
    const n = normalize(f);
    const idx = n.lastIndexOf("/");
    return idx > 0 ? n.slice(0, idx) : n;
  });
  if (!dirs.length) return null;

  const split = (d) => d.split("/").filter(Boolean);
  let common = split(dirs[0]);
  for (const dir of dirs.slice(1)) {
    const parts = split(dir);
    const max = Math.min(common.length, parts.length);
    let i = 0;
    while (i < max && common[i].toLowerCase() === parts[i].toLowerCase()) {
      i += 1;
    }
    common = common.slice(0, i);
    if (!common.length) break;
  }

  if (!common.length) return null;
  const first = normalize(files[0]);
  const isWindows = /^[a-zA-Z]:\//.test(first);
  const root = isWindows ? `${first.slice(0, 2)}/` : "/";
  const merged = `${root}${common.join("/")}`;
  return isWindows ? merged.replace(/\//g, "\\") : merged;
}

function cell(value) {
  const td = document.createElement("td");
  td.textContent = value;
  return td;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setExportLog(message, isError = false) {
  exportLogEl.hidden = false;
  exportLogEl.textContent = message;
  exportLogEl.classList.toggle("error", isError);
}

function resolveOutputDirName() {
  const typed = outputDirInput.value.trim();
  if (typed) {
    return typed;
  }

  return exportFolderSelect.value || "azure-terraform-export";
}

async function loadExportFolders(selectValue = "") {
  try {
    const response = await fetch("/export/azure/folders");
    const folders = response.ok ? await response.json() : [];
    exportFolderSelect.innerHTML = "";

    if (!folders.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No existing folders";
      exportFolderSelect.appendChild(option);
      return;
    }

    for (const folder of folders) {
      const option = document.createElement("option");
      option.value = folder;
      option.textContent = folder;
      exportFolderSelect.appendChild(option);
    }

    if (selectValue) {
      exportFolderSelect.value = selectValue;
    }
  } catch (error) {
    exportFolderSelect.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Failed to load folders";
    exportFolderSelect.appendChild(option);
  }
}

function renderCommandLog(data) {
  const lines = [];
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const message = data.message || data.detail || "";

  if (message) {
    lines.push(`Error: ${message}`);
    lines.push("");
  }

  if (steps.length) {
    for (const step of steps) {
      const cmd = Array.isArray(step.command) ? step.command.join(" ") : "";
      lines.push(`$ ${cmd}`);
      lines.push(`exit ${step.exit_code}`);
      if (step.stdout) {
        lines.push(step.stdout);
      }
      if (step.stderr) {
        lines.push(step.stderr);
      }
      lines.push("");
    }
  } else if (data.command) {
    lines.push(`$ ${data.command.join(" ")}`);
  }

  if (data.stdout) {
    lines.push(data.stdout);
  }
  if (data.stderr) {
    lines.push(data.stderr);
  }

  lines.push(`Output directory: ${data.output_dir || ""}`);
  return lines.join("\n");
}

setMode("file");
loadExportFolders();
