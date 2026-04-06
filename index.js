import { characters, user_avatar, eventSource, event_types } from "../../../../script.js";
import { power_user } from "../../../power-user.js";

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

let state = {
    tab: "chars",
    selected: null,
    data: loadData(),
};

// ── Entity lists ──────────────────────────────────────────
function getEntityList() {
    if (state.tab === "chars") {
        return (characters || []).map(c => ({
            key: c.avatar,
            name: c.name,
            thumb: `thumbnail?type=avatar&file=${encodeURIComponent(c.avatar)}`,
        }));
    } else {
        const personas = power_user?.personas || {};
        return Object.entries(personas).map(([key, name]) => ({
            key,
            name: name || key,
            thumb: `User Avatars/${key}`,
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
                <img src="${e.thumb}" onerror="this.src='img/ai4.png'" />
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
        $label.text(state.tab === "chars" ? "Выберите персонажа выше" : "Выберите персону выше");
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
            <div class="ag-thumb${i === 0 ? " active" : ""}" data-idx="${i}" title="Кликни чтобы применить">
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
        $(".mes").each(function() {
            const chName = $(this).attr("ch_name");
            const ch = (characters || []).find(c => c.name === chName && c.avatar === state.selected);
            if (ch) $(this).find("img.avatar").attr("src", src);
        });
        $(`.character_select[data-avatar="${state.selected}"] img`).attr("src", src);
        $(`.avatar_container[imgfile="${state.selected}"] img`).attr("src", src);
    } else {
        $(".mes.is_user img.avatar").attr("src", src);
        $(`.persona_select[data-uid="${state.selected}"] img`).attr("src", src);
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

// ── Auto-select current entity ────────────────────────────
function autoSelectCurrent() {
    if (state.tab === "chars") {
        const currentChar = characters?.[window.this_chid];
        if (currentChar && currentChar.avatar) {
            state.selected = currentChar.avatar;
        }
    } else {
        const currentPersona = window.user_avatar;
        if (currentPersona) {
            state.selected = currentPersona;
        }
    }
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
    $(document).on("click", ".mes img.avatar", function() {
        const $mes = $(this).closest(".mes");
        let entityKey = null;
        let tab = null;

        if ($mes.hasClass("is_user")) {
            tab = "personas";
            entityKey = window.user_avatar || null;
        } else {
            tab = "chars";
            const chName = $mes.attr("ch_name");
            const ch = (characters || []).find(c => c.name === chName);
            entityKey = ch ? ch.avatar : null;
        }

        if (!entityKey) return;
        const bucket = tab === "chars" ? state.data.chars : state.data.personas;
        const imgs = bucket[entityKey] || [];
        if (imgs.length < 2) return;

        // MutationObserver — ждём появления zoomed_avatar_img в DOM
        const observer = new MutationObserver((mutations, obs) => {
            const $img = $("img.zoomed_avatar_img").filter(":visible").first();
            if (!$img.length) return;

            obs.disconnect();

            // Уже добавлены стрелки?
            if ($img.parent().find(".ag-zoom-nav").length) return;

            let currentIdx = 0;

            const $nav = $(`
                <div class="ag-zoom-nav" style="
                    position: absolute;
                    bottom: 12px;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 99999;
                    display: flex;
                    gap: 10px;
                    pointer-events: all;
                ">
                    <button class="ag-zoom-btn ag-prev" style="
                        background: rgba(0,0,0,0.75);
                        color: #fff;
                        border: none;
                        border-radius: 6px;
                        padding: 8px 20px;
                        font-size: 1.5em;
                        cursor: pointer;
                        line-height: 1;
                        user-select: none;
                    ">&#8592;</button>
                    <button class="ag-zoom-btn ag-next" style="
                        background: rgba(0,0,0,0.75);
                        color: #fff;
                        border: none;
                        border-radius: 6px;
                        padding: 8px 20px;
                        font-size: 1.5em;
                        cursor: pointer;
                        line-height: 1;
                        user-select: none;
                    ">&#8594;</button>
                </div>
            `);

            const $parent = $img.parent();
            $parent.css("position", "relative");
            $parent.append($nav);

            $nav.find(".ag-prev").on("click", function(e) {
                e.stopPropagation();
                e.preventDefault();
                currentIdx = (currentIdx - 1 + imgs.length) % imgs.length;
                $img.attr("src", imgs[currentIdx]);
            });
            $nav.find(".ag-next").on("click", function(e) {
                e.stopPropagation();
                e.preventDefault();
                currentIdx = (currentIdx + 1) % imgs.length;
                $img.attr("src", imgs[currentIdx]);
            });

            console.log(`[AvatarGallery] ✅ Zoom nav injected for ${imgs.length} images`);
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Страховка: отключить observer через 3 секунды
        setTimeout(() => observer.disconnect(), 3000);
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

        // Tabs
        $("#ag-tab-chars").on("click", () => {
            state.tab = "chars";
            state.selected = null;
            $("#ag-tab-chars").addClass("active");
            $("#ag-tab-personas").removeClass("active");
            autoSelectCurrent();
            renderEntityList();
            renderGallery();
        });
        $("#ag-tab-personas").on("click", () => {
            state.tab = "personas";
            state.selected = null;
            $("#ag-tab-chars").removeClass("active");
            $("#ag-tab-personas").addClass("active");
            autoSelectCurrent();
            renderEntityList();
            renderGallery();
        });

        // Upload
        $("#ag-upload-btn").on("click", () => $("#ag-file-input").trigger("click"));
        $("#ag-file-input").on("change", function() {
            handleUpload(this.files);
            this.value = "";
        });

        // Drag & drop
        $("#ag-gallery").on("dragover", e => e.preventDefault())
            .on("drop", e => {
                e.preventDefault();
                handleUpload(e.originalEvent.dataTransfer.files);
            });

        // Auto-select when character changes
        eventSource.on(event_types.CHARACTER_SELECTED, () => {
            if (state.tab === "chars") {
                autoSelectCurrent();
                renderEntityList();
                renderGallery();
            }
        });

        // Auto-select when persona changes
        eventSource.on(event_types.PERSONA_SELECTED ?? "persona_selected", () => {
            if (state.tab === "personas") {
                autoSelectCurrent();
                renderEntityList();
                renderGallery();
            }
        });

        injectZoomNav();

        // Initial render with auto-select
        autoSelectCurrent();
        renderEntityList();
        renderGallery();

        console.log(`[${extensionName}] ✅ Loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed:`, error);
    }
});
