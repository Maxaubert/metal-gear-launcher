import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import type { GameState } from "@shared/ipc";
import type { GameSettings, SettingField, SettingsChange, SettingsSection, SettingValue } from "@shared/settings";
import type { Action } from "../input/navigationReducer";
import type { InputKind } from "../input/useNavigation";
import { layoutVars, themeVars } from "../theme/theme";
import ControllerPreview from "./ControllerPreview";
import NumberSetting from "./NumberSetting";
import Mg12ScreenPreview from "./Mg12ScreenPreview";
import { mgs2ScreenHelp } from "./mgs2ScreenHelp";
import { graphicsEdit } from "./graphicsEdit";
import type { GameSettingsCache } from "./gameSettingsCache";
import Mgs1NativeText from "../typography/Mgs1NativeText";
import { MGS1_TEXT_SPRITES } from "../typography/mgs1Typography";

type Props = {
  game: GameState;
  lastInputKind: InputKind;
  actionRef: MutableRefObject<((action: Action) => void) | null>;
  onClose: () => void;
  settingsCache: GameSettingsCache;
  onDetailChange: (detail: boolean) => void;
};
type Row = { id: string; label: string; field?: SettingField; mute?: SettingField; section?: SettingsSection; selected?: boolean; onSelect?: () => void };
const changeKey = (section: string, field: string) => `${section}\n${field}`;
const MUTE_FIELDS: Record<string, string> = {
  launcherMasterVolume: "launcherMute", SndMasterVol: "SndMute", SndVolBGM: "SndMuteBGM",
  SndVolVoise: "SndMuteVoise", SndVolSE: "SndMuteSE", SndVolDemo: "SndMuteDemo",
  _10_volume_game: "_30_mute_game", _11_volume_ui: "_31_mute_ui",
  volumeUi: "muteUi", volumeGame: "muteGame",
};

export default function SettingsScreen({ game, lastInputKind, actionRef, onClose, settingsCache, onDetailChange }: Props) {
  const initial = settingsCache.peek(game.pack.id);
  const [settings, setSettings] = useState<GameSettings | null>(() => initial?.ok ? initial.value : null);
  const [category, setCategory] = useState<string | null>(null);
  const [patchId, setPatchId] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);
  const [changes, setChanges] = useState<Record<string, SettingsChange>>({});
  const [initialize, setInitialize] = useState<string[]>([]);
  const [busy, setBusy] = useState(!initial);
  const [message, setMessage] = useState(() => initial && !initial.ok ? initial.error : "");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardItem, setDiscardItem] = useState(0);
  const [accountPage, setAccountPage] = useState(false);
  const generation = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const dirty = Object.keys(changes).length > 0 || initialize.length > 0;

  async function load(accountId?: string, refresh = true) {
    const current = ++generation.current;
    setBusy(true);
    setMessage("");
    const result = await settingsCache.read(game.pack.id, accountId, { refresh });
    if (current !== generation.current) return;
    if (result.ok) {
      setSettings(result.value);
      setChanges({});
      setInitialize([]);
    } else setMessage(result.error);
    setBusy(false);
  }
  useEffect(() => {
    if (!initial) void load(undefined, false);
    // Invalidate asynchronous replies when this screen leaves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++; };
    // A settings screen is remounted when its game changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.pack.id]);

  async function save() {
    if (!settings || busy || !dirty) return;
    setBusy(true);
    setMessage("");
    const result = await window.hub.saveGameSettings({
      gameId: game.pack.id, accountId: settings.accountId, revision: settings.revision,
      changes: Object.values(changes), initializeSectionIds: initialize,
    });
    if (result.ok) {
      settingsCache.remember(result.value);
      setSettings(result.value);
      setChanges({});
      setInitialize([]);
      setMessage("Settings saved.");
    } else setMessage(result.error);
    setBusy(false);
  }
  function openCategory(value: string | null, patch: string | null = null) {
    setCategory(value);
    setPatchId(patch);
    setFocus(0);
    setMessage("");
  }
  function back() {
    if (busy) return;
    if (accountPage) { setAccountPage(false); setFocus(0); }
    else if (patchId) openCategory("Community Fixes");
    else if (category) openCategory(null);
    else if (dirty) { setDiscardOpen(true); setDiscardItem(0); }
    else onClose();
  }
  function edit(section: SettingsSection, field: SettingField, value: SettingValue, selectCustom = true) {
    if (busy || field.readOnly || section.status === "unsupported") return;
    if (section.status === "needsSetup" && !initialize.includes(section.id)) return;
    const key = changeKey(section.id, field.id);
    setChanges((previous) => {
      const graphics = graphicsEdit(settings, previous, section, field, value, selectCustom);
      if (graphics) return graphics;
      const next = { ...previous };
      const projection = presetProjection(section, field);
      const baseline = projection?.preset === 2 ? projection.value : field.value;
      if (value === baseline) delete next[key];
      else next[key] = { sectionId: section.id, fieldId: field.id, value };
      return next;
    });
    setMessage("");
  }
  function currentValue(section: SettingsSection, field: SettingField) {
    const projection = presetProjection(section, field);
    if (projection && projection.preset !== 2) return projection.value;
    if (projection) return changes[changeKey(section.id, field.id)]?.value ?? projection.value;
    return changes[changeKey(section.id, field.id)]?.value ?? field.value;
  }
  function presetProjection(section: SettingsSection, field: SettingField) {
    if (section.kind !== "native" || field.id === "HiresoPreset") return undefined;
    const presetSection = settings?.sections.find((source) => source.kind === "native" && source.fields.some((item) => item.id === "HiresoPreset"));
    const preset = presetSection?.fields.find((item) => item.id === "HiresoPreset");
    if (!preset || !presetSection) return undefined;
    const value = changes[changeKey(presetSection.id, preset.id)]?.value ?? preset.value;
    const projected = preset.options?.find((option) => option.value === value)?.fieldValues?.[field.id];
    return projected === undefined ? undefined : { value: projected, preset: value };
  }
  function adjust(row: Row | undefined, direction: number) {
    if (!row?.field || !row.section || row.field.readOnly) return;
    const { field, section } = row;
    const value = currentValue(section, field);
    if (field.kind === "toggle") edit(section, field, !value);
    else if (field.options?.length) {
      const index = field.options.findIndex((option) => option.value === value);
      const next = (index + direction + field.options.length) % field.options.length;
      edit(section, field, field.options[next]!.value);
    } else if (field.kind === "range" && typeof value === "number") {
      const next = Number((value + direction * (field.step ?? 1)).toFixed(4));
      edit(section, field, Math.max(field.min ?? next, Math.min(field.max ?? next, next)));
    }
  }

  const native = settings?.sections.filter((section) => section.kind === "native") ?? [];
  const patches = settings?.sections.filter((section) => section.kind === "patch") ?? [];
  const categories = [...new Set(native.flatMap((section) => section.fields.map((field) => field.category)))];
  const categoryOrder = ["Language", "Screen", "Audio", "Notices", "Button Settings", "Button Icons"];
  categories.sort((a, b) => {
    const first = categoryOrder.indexOf(a), second = categoryOrder.indexOf(b);
    return (first < 0 ? 100 : first) - (second < 0 ? 100 : second);
  });
  const selectedPatch = patches.find((section) => section.id === patchId);
  let rows: Row[];
  if (accountPage) {
    rows = settings?.accounts.map((account) => ({ id: account.id, label: account.label, onSelect: () => {
      setAccountPage(false); setFocus(0); void load(account.id, false);
    } })) ?? [];
  } else if (!category) {
    rows = categories.map((name) => ({ id: name, label: name, onSelect: () => openCategory(name) }));
    for (const section of native.filter((s) => !s.fields.length)) {
      rows.push({ id: section.id, label: section.title, onSelect: () => openCategory(section.id) });
    }
    rows.push({ id: "patches", label: "Community Fixes", onSelect: () => openCategory("Community Fixes") });
    if ((settings?.accounts.length ?? 0) > 1) rows.push({ id: "account", label: "Steam Account", onSelect: () => {
      if (dirty) setMessage("Save or discard changes before switching accounts.");
      else { setAccountPage(true); setFocus(0); }
    } });
  } else if (category === "Community Fixes" && !patchId) {
    rows = patches.map((section) => ({ id: section.id, label: section.title, section,
      onSelect: () => openCategory("Community Fixes", section.id) }));
  } else {
    const sections = selectedPatch ? [selectedPatch] : native;
    rows = sections.flatMap((section) => section.fields
      .filter((field) => selectedPatch || field.category === category)
      .map((field) => {
        const projection = presetProjection(section, field);
        const windowMode = section.fields.find((item) => item.id === "WindowMode");
        const windowSizeDisabled = game.pack.id === "mgspw" && field.id === "WindowSizeMode" && windowMode && !currentValue(section, windowMode);
        const displayed = windowSizeDisabled ? { ...field, readOnly: true, description: "Choose Windowed mode to change the window size." }
          : projection && projection.preset !== 2 && !field.readOnly ? { ...field, description: `Changing this setting selects Custom. ${field.description ?? ""}`.trim() } : field;
        return { id: changeKey(section.id, field.id), label: field.label, field: displayed, section };
      }));
    if (!selectedPatch && category === "Screen") {
      const fieldOrder = game.pack.id === "mgs1" ? ["resolution", "smoothing", "screenSize", "screenPosition", "wallpaper", "scanlines", "BOOT_FULLSCREEN"]
        : game.pack.id === "mg12" ? ["WallAlign", "WallType", "WindowMode"]
        : game.pack.id === "mgs4" ? ["WindowMode", "ScreenResolution", "MonitorIndex"]
        : ["HiresoPreset", "HiresoRender", "CustomResolution", "HiresoUpScale", "CustomUpscale", "HiresoMovie", "CustomMovie", "WindowMode"];
      const priority = (row: Row) => { const index = fieldOrder.indexOf(row.field?.id ?? ""); return index < 0 ? 100 : index; };
      rows.sort((a, b) => priority(a) - priority(b));
    }
    if (!selectedPatch && /^(Audio|Sound)$/.test(category)) {
      const paired = new Set<string>();
      for (const row of rows) {
        const muteId = row.field && MUTE_FIELDS[row.field.id];
        const mute = muteId && row.section?.fields.find((field) => field.id === muteId);
        if (mute && row.section) { row.mute = mute; paired.add(changeKey(row.section.id, mute.id)); }
      }
      rows = rows.filter((row) => !paired.has(row.id));
    }
    if (!selectedPatch && category === "Language") {
      const languageOrder = ["English", "French", "Italian", "German", "Spanish", "Portuguese (Brazil)", "Japanese"];
      rows = rows.flatMap((row) => row.field?.options && row.section ? [...row.field.options]
        .sort((a, b) => languageOrder.indexOf(a.label) - languageOrder.indexOf(b.label))
        .map((option) => ({ id: `${row.id}-${option.value}`, label: option.label,
          selected: currentValue(row.section!, row.field!) === option.value,
          onSelect: () => edit(row.section!, row.field!, option.value) })) : [row]);
    }
    if (!selectedPatch && /^(Audio|Sound|Screen|Button Icons|Button Settings)$/.test(category)) {
      const defaults = native.flatMap((section) => section.fields.filter((field) => field.category === category && field.defaultValue !== undefined && !field.readOnly)
        .map((field) => ({ section, field })));
      if (defaults.length) rows.push({ id: "reset", label: "Restore Defaults", onSelect: () => {
        for (const { section, field } of defaults) edit(section, field, field.defaultValue!, false);
      } });
    }
    if (selectedPatch?.status === "needsSetup" && !initialize.includes(selectedPatch.id)) {
      rows = [{ id: "initialize", label: "Set Up This Fix", onSelect: () => {
        setInitialize((previous) => [...previous, selectedPatch.id]);
        setMessage("Defaults selected. Review the settings, then choose Save Changes to apply them.");
      } }];
    }
  }
  const contextMessage = selectedPatch?.message ?? native.find((section) => section.id === category)?.message
    ?? (category === "Community Fixes" ? rows[focus]?.section?.status === "needsSetup" ? "Open to review setup for this installed fix."
      : rows[focus]?.section?.fields.length ? "Open to review and edit this installed fix's settings." : "This installed component has no editable settings." : undefined);
  const fieldDescription = rows[focus]?.field?.description;
  const title = accountPage ? "Steam Account" : selectedPatch?.title ?? category ?? "Options";
  const detail = Boolean(category || accountPage);
  useLayoutEffect(() => { onDetailChange(detail); }, [detail, onDetailChange]);
  const buttonIcons = (category === "Button Icons" || category === "Button Settings") && !selectedPatch;
  const controllerLabel = (field: SettingField, value: SettingValue) => field.id === "confirmButtonSwap"
    ? lastInputKind === "keyboard" ? value ? "Space" : "H" : value ? "Swapped" : "Default"
    : field.options?.find((option) => option.value === value)?.label ?? String(value);
  const categoryHelp = category === "Language" ? "Select your preferred display language."
    : category === "Audio" ? "Adjust the volume."
    : category === "Screen" ? game.pack.id === "mgspw" && native.some((section) => section.fields.some((field) => field.id === "HiresoPreset" && currentValue(section, field) === 0))
      ? "Graphics will be equal to that of the HD Edition release." : "You can adjust various settings to match your setup."
    : category === "Button Settings" ? "Change the confirmation button."
    : buttonIcons ? "Change the button icons displayed in the game." : "";
  const actions: Row[] = [];
  if (message && !dirty) actions.push({ id: "reload", label: "Reload", onSelect: () => void load(settings?.accountId) });
  if (dirty) actions.push(
    { id: "discard", label: "Discard Changes", onSelect: () => void load(settings?.accountId) },
    { id: "save", label: "Save Changes", onSelect: () => void save() },
  );
  actions.push({ id: "back", label: "Back", onSelect: back });
  const navigationRows = [...rows, ...actions];

  function activateRow(row: Row | undefined) {
    if (row?.onSelect) row.onSelect();
    else if (row?.field?.kind === "text" || row?.field?.kind === "range" && (row.field.max ?? 0) > 100) {
      const input = listRef.current?.querySelector<HTMLInputElement>('[data-focused="true"] input');
      input?.focus(); input?.select();
    } else if (row?.mute && row.section) edit(row.section, row.mute, !currentValue(row.section, row.mute));
    else adjust(row, 1);
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-focused="true"]')?.scrollIntoView({ block: "nearest" });
  }, [focus, category, patchId]);
  useEffect(() => {
    actionRef.current = (action) => {
      if (busy) return;
      if (discardOpen) {
        if (action === "up" || action === "down") setDiscardItem((index) => 1 - index);
        else if (action === "back") setDiscardOpen(false);
        else if (action === "confirm") {
          if (discardItem === 0) setDiscardOpen(false);
          else onClose();
        }
        return;
      }
      if (action === "back" && document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
      else if (action === "back") back();
      else if (action === "up" || action === "down") {
        setFocus((index) => (index + (action === "up" ? -1 : 1) + navigationRows.length) % navigationRows.length);
      } else if (action === "left" || action === "right") adjust(rows[focus], action === "left" ? -1 : 1);
      else if (action === "confirm") activateRow(navigationRows[focus]);
      else if (action === "menu") void save();
    };
    return () => { actionRef.current = null; };
  });

  function previewValue(fieldId: string) {
    const row = rows.find((item) => item.field?.id === fieldId);
    return row?.section && row.field ? Number(currentValue(row.section, row.field)) : 0;
  }
  const focusedFieldId = rows[focus]?.field?.id;
  const screenHelp = category === "Screen" && game.pack.id === "mgs2"
    ? mgs2ScreenHelp(focusedFieldId, previewValue("HiresoPreset"), focusedFieldId ? previewValue(focusedFieldId) : undefined) : undefined;
  const availabilityHelp = rows[focus]?.field?.readOnly ? fieldDescription
    : fieldDescription?.startsWith("Changing this setting selects Custom.") ? "Changing this setting selects Custom." : undefined;
  if (screenHelp && availabilityHelp) screenHelp.side = `${availabilityHelp}\n\n${screenHelp.side}`.trim();
  const text = (value: string, sprite?: string) => game.pack.id === "mgs1"
    ? <Mgs1NativeText assetUrls={game.assetUrls} text={value} sprite={sprite} /> : value;
  const headings: Record<string, string> = { Options: MGS1_TEXT_SPRITES.headingOptions, Language: MGS1_TEXT_SPRITES.headingLanguage,
    Screen: MGS1_TEXT_SPRITES.headingScreen, Audio: MGS1_TEXT_SPRITES.headingAudio, "Button Settings": MGS1_TEXT_SPRITES.headingButtonSettings };

  return <div className="screen settings-screen" data-testid="settings-screen" data-game={game.pack.id}
    data-layout="v2" data-detail={detail ? "true" : undefined} data-category={category} style={{ ...themeVars(game.pack.theme), ...layoutVars(game.pack.id),
      ...(game.pack.id === "mgs1" ? { "--divider-x": "62.2vw", "--col-x": "63.5vw", "--col-right": "99.4vw" } : {}),
      ...(detail ? { "--ink": "#080808", "--paper": "#dcdcda" } : {}),
    } as CSSProperties}>
    <div className="settings-heading"><span className="settings-heading-marker" aria-hidden="true" />{text(title, headings[title])}</div>
    {buttonIcons && <div className="settings-table-head"><span>Settings</span><span>Current Settings</span><span>Updated Settings</span></div>}
    <div className="settings-list" ref={listRef} role="group" aria-label={title}>
      {busy && <p className="settings-notice" role="status">Loading settings...</p>}
      {!busy && rows.map((row, index) => {
        const field = row.field;
        const value = field && row.section ? currentValue(row.section, field) : undefined;
        const label = field?.options?.find((option) => option.value === value)?.label
          ?? (typeof value === "boolean" ? value ? "ON" : "OFF" : String(value ?? ""));
        return <div key={row.id} className={`settings-row${focus === index ? " focused" : ""}${field ? " has-value" : ""}${field?.readOnly ? " read-only" : ""}${buttonIcons ? " controller-row" : ""}`}
          data-focused={focus === index ? "true" : undefined} data-testid={`setting-${field?.id ?? row.id}`}
          onMouseEnter={() => setFocus(index)}>
          <button className="settings-row-label" aria-label={row.label} disabled={busy} aria-disabled={Boolean(field?.readOnly || row.section?.status === "unsupported" && field)}
            onFocus={() => setFocus(index)} onClick={() => activateRow(row)}>
            {text(row.label)}{row.selected && <span className="settings-selected" aria-label="Selected">✓</span>}
            {!field && row.section && <small>{row.section.status === "needsSetup" ? "Needs setup" : row.section.version ?? "Detected"}</small>}
          </button>
          {buttonIcons && field && <div className="settings-current">{field.id === "confirmButtonSwap" ? controllerLabel(field, field.value) : <ControllerPreview value={field.value} label={controllerLabel(field, field.value)} />}</div>}
          {field && <div className="settings-value">
            {row.mute && <button className="volume-mute" aria-label={`Mute ${field.label}`} aria-pressed={Boolean(currentValue(row.section!, row.mute))}
              disabled={busy || row.mute.readOnly} onClick={() => edit(row.section!, row.mute!, !currentValue(row.section!, row.mute!))}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" />{currentValue(row.section!, row.mute) ? <path d="m16 9 6 6m0-6-6 6" /> : <path d="M16 8q4 4 0 8m3-11q7 7 0 14" />}</svg>
            </button>}
            {field.kind === "range" && field.category === "Audio" && !row.mute && <span className="volume-icon-space" />}
            {field.kind === "range" && field.category === "Audio" && <span className="volume-number">{Number(value) / (field.max ?? 10) * 10}</span>}
            <button aria-label={`Decrease ${field.label}`} disabled={busy || field.readOnly} onClick={() => adjust(row, -1)}>◀</button>
            {field.kind === "range" && (field.max ?? 0) > 100 ? <NumberSetting key={String(value)} field={field} value={Number(value)} disabled={busy || Boolean(field.readOnly)} onCommit={(next) => edit(row.section!, field, next)} />
              : field.kind === "text" ? <input aria-label={field.label} value={String(value)} disabled={busy || field.readOnly}
                onChange={(event) => edit(row.section!, field, event.target.value)} /> : field.kind === "range" && /^(Audio|Sound)$/.test(field.category) ? <output className="volume-bars" aria-label={`${field.label}: ${label}`}>
                {Array.from({ length: 10 }, (_, index) => <span key={index} className={Number(value) >= (index + 1) * (field.max ?? 10) / 10 ? "filled" : ""} />)}
              </output> : <output aria-label={field.label}>{field.id === "confirmButtonSwap" ? text(controllerLabel(field, value!)) : buttonIcons ? <ControllerPreview value={value!} label={label} /> : text(label)}</output>}
            <button aria-label={`Increase ${field.label}`} disabled={busy || field.readOnly} onClick={() => adjust(row, 1)}>▶</button>
          </div>}
        </div>;
      })}
      {!busy && !rows.length && <p className="settings-notice">{category === "Community Fixes"
        ? "No supported community fixes detected for this game." : contextMessage ?? "No settings are available in this category."}</p>}
    </div>
    {detail && category === "Screen" && ["mgs2", "mgs3", "mgspw"].includes(game.pack.id) && <aside className="settings-side-help">{screenHelp ? screenHelp.side : game.pack.id === "mgspw" ? "This setting can be changed prior to starting the game." : fieldDescription || "This setting can be changed prior to starting the game.\n\nDepending on your setup, game performance may suffer when not set to Original Mode.\n\nConsider switching to Custom and adjusting the settings such as the Internal Resolution, or reverting to Original Mode if you experience any instability."}</aside>}
    {detail && category === "Screen" && game.pack.id === "mg12" && !busy && <Mg12ScreenPreview assetUrls={game.assetUrls}
      wallpaper={previewValue("WallType")} alignment={previewValue("WallAlign")} />}
    <div className="settings-help" aria-live="polite">{text(message || (screenHelp ? screenHelp.footer : category === "Screen" && game.pack.id === "mg12" ? "" : category === "Screen" ? categoryHelp : fieldDescription || contextMessage || categoryHelp))}</div>
    <div className="settings-actions">
      {actions.map((action, index) => <button key={action.id} disabled={busy}
        className={focus === rows.length + index ? "focused" : ""}
        onMouseEnter={() => setFocus(rows.length + index)} onFocus={() => setFocus(rows.length + index)} onClick={action.onSelect}>{text(action.label)}</button>)}
    </div>
    <div className="settings-hints" aria-hidden="true">{lastInputKind === "gamepad"
      ? "↑ ↓ Move cursor　← → Change　A Confirm　B Back　Menu Save"
      : `↑ ↓ Move cursor　← → Change　Enter ${category === "Audio" ? "Mute" : "Confirm"}　Esc Back　Tab Save`}</div>
    {discardOpen && <div className="overlay settings-discard" role="dialog" aria-modal="true" aria-label="Unsaved settings">
      <div><p>Discard unsaved changes?</p>{["Keep Editing", "Discard and Leave"].map((label, index) =>
        <button key={label} className={discardItem === index ? "focused" : ""}
          onMouseEnter={() => setDiscardItem(index)} onClick={() => index === 0 ? setDiscardOpen(false) : onClose()}>{label}</button>)}</div>
    </div>}
  </div>;
}
