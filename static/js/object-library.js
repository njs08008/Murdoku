// ── Object Library Manager ─────────────────────────────────────────────────────

function openObjectLibrary() {
  showView("objects");
  renderObjectLibrary();
}

function renderObjectLibrary() {
  const list = document.getElementById("object-list");
  list.innerHTML = OBJECT_LIBRARY.map((obj, i) => {
    const isImage   = obj.icon && obj.icon.startsWith("/");
    const preview   = isImage
      ? `<img src="${escHtml(obj.icon)}" class="obj-img-preview" alt="${escHtml(obj.label)}" />`
      : `<span class="obj-icon-preview">${escHtml(obj.icon || "❓")}</span>`;

    const iconInput = isImage
      ? `<div class="obj-icon-image-set">
           <span class="obj-icon-url-short" title="${escHtml(obj.icon)}">${escHtml(obj.icon.split("/").pop())}</span>
           <button class="btn btn-ghost btn-xs" onclick="clearObjectImage(${i})">✕ Clear</button>
         </div>`
      : `<input class="obj-icon-input" type="text" value="${escHtml(obj.icon || "")}"
               oninput="updateObject(${i}, 'icon', this.value)" placeholder="Emoji or symbol" maxlength="8" />`;

    return `
      <div class="obj-row" data-i="${i}">
        <div class="obj-preview-cell">${preview}</div>
        <div class="obj-icon-cell">
          ${iconInput}
          <label class="obj-upload-btn btn btn-ghost btn-xs" title="Upload image">
            📁
            <input type="file" accept="image/*" style="display:none"
                   onchange="handleObjectImageUpload(event, ${i})" />
          </label>
        </div>
        <input class="obj-label-input" type="text" value="${escHtml(obj.label)}"
               oninput="updateObject(${i}, 'label', this.value)" placeholder="Label" />
        <input class="obj-id-input" type="text" value="${escHtml(obj.id)}"
               oninput="updateObject(${i}, 'id', this.value)" placeholder="id (no spaces)" />
        <label class="obj-blocks-label" title="If checked, no person can be placed in this cell">
          <input type="checkbox" ${obj.blocks ? "checked" : ""}
                 onchange="updateObject(${i}, 'blocks', this.checked)" />
          Blocks placement
        </label>
        <button class="btn btn-danger btn-sm" onclick="removeObject(${i})">✕</button>
      </div>
    `;
  }).join("");
}

async function handleObjectImageUpload(event, i) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate type and size (max 1 MB)
  if (!file.type.startsWith("image/")) { mdAlert("Please select an image file."); return; }
  if (file.size > 1024 * 1024) { mdAlert("Image must be under 1 MB."); return; }

  // Read as base64
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Upload to server
  try {
    // Delete the old image file if there was one
    const existingIcon = OBJECT_LIBRARY[i]?.icon;
    if (existingIcon && existingIcon.startsWith("/")) {
      api.deleteObjectImage(existingIcon).catch(() => {}); // best-effort
    }
    const result = await api.uploadObjectImage(file.name, data);
    updateObject(i, "icon", result.url);
    renderObjectLibrary();
  } catch (e) {
    mdAlert("Upload failed: " + e.message);
  }
}

function clearObjectImage(i) {
  const existingIcon = OBJECT_LIBRARY[i]?.icon;
  if (existingIcon && existingIcon.startsWith("/")) {
    api.deleteObjectImage(existingIcon).catch(() => {});
  }
  updateObject(i, "icon", "❓");
  renderObjectLibrary();
}

function updateObject(i, field, value) {
  OBJECT_LIBRARY[i][field] = value;
  if (field === "icon") {
    // Live-update preview without full re-render
    const row     = document.querySelector(`.obj-row[data-i="${i}"]`);
    const preview = row && row.querySelector(".obj-preview-cell");
    if (preview) {
      if (value.startsWith("/")) {
        preview.innerHTML = `<img src="${escHtml(value)}" class="obj-img-preview" alt="" />`;
      } else {
        preview.innerHTML = `<span class="obj-icon-preview">${escHtml(value)}</span>`;
      }
    }
  }
}

function removeObject(i) {
  OBJECT_LIBRARY.splice(i, 1);
  renderObjectLibrary();
}

function addObject() {
  OBJECT_LIBRARY.push({ id: "new_" + Date.now(), label: "New Object", icon: "❓", blocks: false });
  renderObjectLibrary();
  document.getElementById("object-list").lastElementChild?.scrollIntoView({ behavior: "smooth" });
}

async function saveObjectLibrary() {
  const ids = OBJECT_LIBRARY.map(o => o.id.trim());
  if (ids.some(id => !id)) { mdAlert("All objects must have an ID."); return; }
  if (new Set(ids).size !== ids.length) { mdAlert("Object IDs must be unique."); return; }
  if (OBJECT_LIBRARY.some(o => !o.label.trim())) { mdAlert("All objects must have a label."); return; }

  await api.saveObjects(OBJECT_LIBRARY);
  const saved = await api.getObjects();
  OBJECT_LIBRARY = saved.sort((a, b) => a.label.localeCompare(b.label));
  renderObjectLibrary();
  mdAlert("Object library saved!");
}

async function resetObjectLibrary() {
  if (!await mdConfirm("Reset object library to defaults? Custom images will remain in storage but won't be referenced.")) return;
  const DEF = [
    {id:"chair",    label:"Chair",    icon:"🪑", blocks:false},
    {id:"bed",      label:"Bed",      icon:"🛏",  blocks:true},
    {id:"table",    label:"Table",    icon:"🪞",  blocks:false},
    {id:"window",   label:"Window",   icon:"🪟",  blocks:false},
    {id:"door",     label:"Door",     icon:"🚪",  blocks:false},
    {id:"lamp",     label:"Lamp",     icon:"💡",  blocks:false},
    {id:"phone",    label:"Phone",    icon:"📞",  blocks:false},
    {id:"fireplace",label:"Fireplace",icon:"🔥",  blocks:false},
    {id:"plant",    label:"Plant",    icon:"🌿",  blocks:false},
    {id:"safe",     label:"Safe",     icon:"🗄️",  blocks:true},
    {id:"piano",    label:"Piano",    icon:"🎹",  blocks:true},
    {id:"stairs",   label:"Stairs",   icon:"🪜",  blocks:false},
  ];
  OBJECT_LIBRARY = DEF;
  await api.saveObjects(OBJECT_LIBRARY);
  renderObjectLibrary();
}

document.getElementById("obj-add-btn").addEventListener("click", addObject);
document.getElementById("obj-save-btn").addEventListener("click", saveObjectLibrary);
document.getElementById("obj-reset-btn").addEventListener("click", resetObjectLibrary);
document.getElementById("obj-back-btn").addEventListener("click", loadHome);
