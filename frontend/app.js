const state = {
  mode: "file",
  resources: [],
};

const modeButtons = document.querySelectorAll(".mode-btn");
const form = document.getElementById("analyze-form");
const fileInput = document.getElementById("iac-input");
const fileLabel = document.getElementById("file-label");
const statusEl = document.getElementById("status");
const summaryPanel = document.getElementById("summary-panel");
const diagramPanel = document.getElementById("diagram-panel");
const tablePanel = document.getElementById("table-panel");
const resourceCountEl = document.getElementById("resource-count");
const typeCountEl = document.getElementById("type-count");
const chipsEl = document.getElementById("chips");
const diagramEl = document.getElementById("diagram");
const tableBody = document.getElementById("resource-table-body");
const filterInput = document.getElementById("table-filter");

for (const btn of modeButtons) {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
}

form.addEventListener("submit", onSubmit);
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

  const formData = new FormData();
  let endpoint = "/analyze/file";

  if (state.mode === "file") {
    formData.append("tf_file", selected);
  } else {
    endpoint = "/analyze/folder";
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

    state.resources = payload.resources || [];
    renderSummary(payload);
    renderDiagram(payload.resources || []);
    renderTable(payload.resources || [], filterInput.value);

    summaryPanel.hidden = false;
    diagramPanel.hidden = false;
    tablePanel.hidden = false;

    setStatus(
      `Done. Found ${payload.resource_count} resources across ${payload.resource_types.length} types.`
    );
  } catch (error) {
    summaryPanel.hidden = true;
    diagramPanel.hidden = true;
    tablePanel.hidden = true;
    setStatus(`Error: ${error.message}`, true);
  }
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
    cell.colSpan = 4;
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

function cell(value) {
  const td = document.createElement("td");
  td.textContent = value;
  return td;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

setMode("file");
