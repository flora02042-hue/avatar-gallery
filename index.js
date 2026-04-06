import { characters } from "../../../../script.js";

const extensionName = "avatar-gallery";
const STORE_KEY = "avatar_gallery_data";

// ── Storage ──────────────────────────────────────────────
function loadData() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        return raw ? JSON.parse(raw) : { chars: {}, personas: {} };
    } catch { return { chars: {}, personas: {} }; }
}
function saveData(data) {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

// ── State ─────────────────────────────────────────────────
let state = {
    tab: "chars",
    selected: null,
    data: loadData(),
};

// ── Helpers ───────────────────────────────────────────────
function getEntityList() {
    if (state.tab === "chars") {
        return (characters || []).map(c => ({
            key: c.avatar,
            name: c.name,
            avatar: c.avatar ? `characters/${c.avatar}` : "img/ai4.png",
        }));
    } else {
        const p = window.power_user?.personas || {};
        return Object.entries(p).map(([key, name]) => ({
            key,
            name: name || key,
            avatar: key ? `User Avatars/${key}` : "img/ai4.png",
        }));
    }
}

function getGallery() {
    const bucket = state.tab === "chars" ? state.data.chars : state.data.personas;
    return bucket[state.selected] || [];
}
function setGallery(imgs) {
    const bucket = state.tab === "chars" ? state.data.chars : state.data.personas;
    bucket[state.selected] = imgs;
    saveData(state.data);
}

// ── Render ────────────────────────────────────────────────
function renderEntityList() {
    const $el = $("#ag-entity-list");
    $el.empty();
    const list = getEntityList();
    if (!list.length) {
        $el.append('<div style="padding:6px;font-size:0.8em;opacity:0.5;text-align:center">Список пуст</div>');
        return;
    }
    list.forEach(e => {
        const isSelected = e.key === state.selected;
        const $item = $(`
            <div class="ag-entity-item${isSelected ? " selected" : ""}" data-key="${e.key}">
                <img src="${e.avatar}" onerror="this.src='img/ai4.png'" />
                <span>${e.name}</span>
            </div>
        `);
        $item.on("click", () => {
            state.selected = e.key;
            renderEntityList();
            renderGallery();
        });
        $el.append($item);
    });
}

function renderGallery() {
    const $gal = $("#ag-gallery");
    const $label = $("#ag-gallery-label");
    $gal.empty();

    if (!state.selected) {
        $label.text("Выберите персонажа или персону выше");
        $gal.append('<div class="ag-empty-gallery">—</div>');
        $("#ag-upload-row").hide();
        return;
    }

    const entity = getEntityList().find(e => e.key === state.selected);
    $label.text(entity ? `Галерея: ${entity.name}` : "Галерея");
    $("#ag-upload-row").show();

    const imgs = getGallery();
    if (!imgs.length) {
        $gal.append('<div class="ag-empty-gallery">Нет аватаров — загрузите через кнопку ниже</div>');
        return;
    }

    imgs.forEach((src, i) => {
        const $thumb = $(`
            <div class="ag-thumb${i === 0 ? " active" : ""}" data-idx="${i}">
                <img src="${src}" onerror="this.style.opacity='0.3'" />
                <button class="ag-thumb-del" title="Удалить">✕</button>
            </div>
        `);
        $thumb.on("click", function(e) {
            if ($(e.target).hasClass("ag-thumb-del")) return;
            applyAvatar(i);
        });
        $thumb.find(".ag-thumb-del").on("click", () => removeAvatar(i));
        $gal.append($thumb);
    });
}

// ── Apply avatar ──────────────────────────────────────────
function applyAvatar(idx) {
    const imgs = getGallery();
    if (!imgs[idx]) return;
    const rotated = [...imgs.slice(idx), ...imgs.slice(0, idx)];
    setGallery(rotated);
    const src = rotated[0];

    if (state.tab === "chars") {
        $(`.mes img.avatar`).each(function() {
            const $mes = $(this).closest(".mes");
            const charName = $mes.attr("ch_name") || $mes.find(".name_text").text();
            const ch = (characters || []).find(c => c.name === charName && c.avatar === state.selected);
            if (ch) $(this).attr("src", src);
        });
        $(`.character_select[data-avatar="${state.selected}"] img`).attr("src", src);
    } else {
        $(".mes.is_user img.avatar").attr("src", src);
        $("#user_avatar_block img").attr("src", src);
    }

    renderGallery();
    toastr.success("Аватар применён!", "Avatar Gallery");
}

function removeAvatar(idx) {
    const imgs = getGallery();
    imgs.splice(idx, 1);
    setGallery(imgs);
    renderGallery();
}

// ── Upload ────────────────────────────────────────────────
function handleUpload(files) {
    if (!state.selected) {
        toastr.warning("Сначала выберите персонажа или персону", "Avatar Gallery");
        return;
    }
    Array.from(files).forEach(file => {
        if (!file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const imgs = getGallery();
            imgs.push(e.target.result);
            setGallery(imgs);
            renderGallery();
        };
        reader.readAsDataURL(file);
    });
}

// ── Zoom overlay arrows ───────────────────────────────────
function injectZoomNav() {
    $(document).on("click", ".mes img.avatar, #user_avatar_block img", function() {
        setTimeout(() => {
            const $zoom = $(".avatar_zoom_image, #avatar_zoom_popup, .zoomed_avatar").first();
            if (!$zoom.length || $zoom.find(".ag-zoom-nav").length) return;

            const $mes = $(this).closest(".mes");
            let entityKey = null;
            let tab = null;

            if ($mes.hasClass("is_user")) {
                tab = "personas";
                entityKey = window.user_avatar || null;
            } else if ($mes.length) {
                tab = "chars";
                const charName = $mes.attr("ch_name") || $mes.find(".name_text").text();
                const ch = (characters || []).find(c => c.name === charName);
                entityKey = ch ? ch.avatar : null;
            }

            if (!entityKey) return;
            const bucket = tab === "chars" ? state.data.chars : state.data.personas;
            const imgs = bucket[entityKey] || [];
            if (imgs.length < 2) return;

            let currentIdx = 0;
            const $wrap = $zoom.closest("[style*='position']").length
                ? $zoom.closest("[style*='position']")
                : $zoom.parent();

            $wrap.css("position", "relative");

            const $nav = $(`
                <div class="ag-zoom-nav">
                    <button class="ag-zoom-btn ag-prev">&#8592;</button>
                    <button class="ag-zoom-btn ag-next">&#8594;</button>
                </div>
            `);
            $wrap.append($nav);

            $nav.find(".ag-prev").on("click", e => {
                e.stopPropagation();
                currentIdx = (currentIdx - 1 + imgs.length) % imgs.length;
                $zoom.find("img").first().attr("src", imgs[currentIdx]);
                $zoom.attr("src", imgs[currentIdx]);
            });
            $nav.find(".ag-next").on("click", e => {
                e.stopPropagation();
                currentIdx = (currentIdx + 1) % imgs.length;
                $zoom.find("img").first().attr("src", imgs[currentIdx]);
                $zoom.attr("src", imgs[currentIdx]);
            });
        }, 200);
    });
}

// ── Init ──────────────────────────────────────────────────
jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);
    try {
        const html = `
        <div class="ag-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>🖼️ Avatar Gallery</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="ag-tabs">
                        <button id="ag-tab-chars" class="menu_button ag-tab active">👤 Персонажи</button>
                        <button id="ag-tab-personas" class="menu_button ag-tab">🧑 Персоны</button>
                    </div>
                    <div id="ag-entity-list" class="ag-entity-list"></div>
                    <div id="ag-gallery-label" class="ag-gallery-label">Выберите персонажа выше</div>
                    <div id="ag-gallery" class="ag-gallery">
                        <div class="ag-empty-gallery">—</div>
                    </div>
                    <div id="ag-upload-row" class="ag-upload-row" style="display:none">
                        <button id="ag-upload-btn" class="menu_button">
                            <i class="fa-solid fa-upload"></i> Загрузить аватар
                        </button>
                        <input type="file" id="ag-file-input" accept="image/*" multiple />
                    </div>
                </div>
            </div>
        </div>`;

        $("#extensions_settings2").append(html);

        $("#ag-tab-chars").on("click", () => {
            state.tab = "chars"; state.selected = null;
            $("#ag-tab-chars").addClass("active");
            $("#ag-tab-personas").removeClass("active");
            renderEntityList(); renderGallery();
        });
        $("#ag-tab-personas").on("click", () => {
            state.tab = "personas"; state.selected = null;
            $("#ag-tab-chars").removeClass("active");
            $("#ag-tab-personas").addClass("active");
            renderEntityList(); renderGallery();
        });

        $("#ag-upload-btn").on("click", () => $("#ag-file-input").trigger("click"));
        $("#ag-file-input").on("change", function() {
            handleUpload(this.files);
            this.value = "";
        });

        $("#ag-gallery").on("dragover", e => e.preventDefault())
            .on("drop", e => {
                e.preventDefault();
                handleUpload(e.originalEvent.dataTransfer.files);
            });

        injectZoomNav();
        renderEntityList();
        renderGallery();

        console.log(`[${extensionName}] ✅ Loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed:`, error);
    }
});
