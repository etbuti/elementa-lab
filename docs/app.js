const $ = (id) => document.getElementById(id);

const elSmiles = $("smiles");
const elAnalyze = $("analyze");
const elDemo = $("demo");
const elSvg = $("molSvg");
const elProps = $("props");
const elAi = $("aiExplain");
const elAiOut = $("aiOut");
const elKey = $("openaiKey");

const elMusicPlay = $("musicPlay");
const elMusicStop = $("musicStop");
const elMusicRegen = $("musicRegen");
const elThemeId = $("themeId");

function on(el, evt, fn) {
  if (!el) return false;
  el.addEventListener(evt, fn);
  return true;
}

function setStatus(msg) {
  // 复用 aiOut 作为状态输出（没有也不报错）
  if (typeof elAiOut !== "undefined" && elAiOut) elAiOut.textContent = msg;
  else console.log(msg);
}

function setProps(obj) {
  elProps.innerHTML = "";
  for (const [k, v] of Object.entries(obj)) {
    const row = document.createElement("div");
    row.className = "kv";
    row.innerHTML = `<b>${escapeHtml(k)}</b><span>${escapeHtml(String(v))}</span>`;
    elProps.appendChild(row);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

if (typeof SmilesDrawer === "undefined") {
  console.error("SmilesDrawer not loaded");
}
if (typeof OCL === "undefined") {
  console.error("OpenChemLib (OCL) not loaded");
}


function drawSmiles(smiles) {
  elSvg.innerHTML = ""; // clear
  const drawer = new SmilesDrawer.SvgDrawer({ width: 420, height: 420, bondThickness: 1.1 });
  SmilesDrawer.parse(smiles, (tree) => {
    drawer.draw(tree, elSvg, "light", false);
  }, (err) => {
    throw new Error("SMILES 解析失败：" + err);
  });
}

function calcBasicProps(smiles) {
  // OpenChemLib
  const mol = OCL.Molecule.fromSmiles(smiles);
  mol.addImplicitHydrogens();
  mol.ensureHelperArrays(OCL.Molecule.cHelperNeighbours);

  const mf = mol.getMolecularFormula(); // contains absoluteWeight etc.
  const mw = mf.absoluteWeight;

  // 下面这些是“基础/近似”属性，先解决可用性
  const atoms = mol.getAllAtoms();
  const bonds = mol.getAllBonds();
  const rings = mol.getRingSet().getSize();

  return {
    "Molecular Weight (approx)": round(mw, 4),
    "Atoms": atoms,
    "Bonds": bonds,
    "Rings (count)": rings,
  };
}

function round(x, n=4) {
  const p = Math.pow(10, n);
  return Math.round(x * p) / p;
}

function analyze() {
  const smiles = elSmiles.value.trim();
  elAiOut.textContent = "";
  if (!smiles) {
    alert("请先输入 SMILES");
    return;
  }

  try {
    drawSmiles(smiles);
  } catch (e) {
    elSvg.innerHTML = "";
    alert(String(e.message || e));
    return;
  }

  try {
    const props = calcBasicProps(smiles);
    setProps(props);
  } catch (e) {
    elProps.innerHTML = "";
    alert("性质计算失败：" + String(e.message || e));
    return;
  }
}

on(elAnalyze, "click", analyze);
on(elDemo, "click", () => {
  elSmiles.value = "CC(=O)OC1=CC=CC=C1C(=O)O";
  analyze();
});
on(elSmiles, "keydown", (e) => {
  if (e.key === "Enter") analyze();
});


// AI button is placeholder for next step 
elAi.addEventListener("click", async () => {
  const smiles = elSmiles.value.trim();
  if (!smiles) return alert("请先输入 SMILES");

  const apiKey = (elKey.value || "").trim();
  if (!apiKey) return alert("请先输入 OpenAI API Key（仅本地使用）");

  let props = {};
  try {
    props = calcBasicProps(smiles);
  } catch (e) {
    props = { note: "props calc failed" };
  }

  const propsLines = Object.entries(props).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  const prompt = `
你是一位严谨但通俗的化学讲解者。请基于以下信息做解释：
SMILES: ${smiles}

Predicted properties:
${propsLines}

请输出（中文）：
1) 这组性质大致意味着什么（极性/疏水性、可能溶解性趋势等）
2) 结构层面可能的官能团/特点（可推断就说，别胡编）
3) 可能的用途方向（用“可能/倾向”措辞，不要当成事实）
4) 一句安全提示：不要据此进行任何危险实验或合成

长度：200~320 字。
`.trim();

  elAiOut.textContent = "生成中…";

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt
      })
    });

    const data = await r.json();

    if (!r.ok) {
      elAiOut.textContent = `OpenAI 请求失败：${r.status}\n${JSON.stringify(data, null, 2)}`;
      return;
    }

    elAiOut.textContent = (data.output_text || "").trim() || "(empty)";
  } catch (e) {
    elAiOut.textContent = "网络或调用错误：" + String(e.message || e);
  }
});

// -------------------- Music Engine (WebAudio) --------------------
let audioCtx = null;
let playingNodes = [];
let currentTheme = null;

function hashStringToInt(str) {
  // 简单稳定 hash（非加密）
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

function makeTheme(smiles) {
  // 用已存在的 calcBasicProps 结果做“音乐种子”
  const props = calcBasicProps(smiles);
  const seedBase = `${smiles}|mw=${props["Molecular Weight (approx)"]}|a=${props["Atoms"]}|r=${props["Rings (count)"]}|b=${props["Bonds"]}`;
  const seed = hashStringToInt(seedBase);
  const rnd = mulberry32(seed);

  // 映射规则（先简单稳定）
  // - 音阶：自然小调/五声音阶（更“异域”一点点）
  const scale = [0, 3, 5, 7, 10]; // minor pentatonic intervals
  // - 根音：由分子量决定落点（C3~C5）
  const mw = props["Molecular Weight (approx)"] || 100;
  const baseMidi = 48 + Math.floor(clamp((mw % 200) / 200 * 24, 0, 24)); // 48..72
  // - 速度：由原子数决定（70..120 BPM）
  const atoms = props["Atoms"] || 20;
  const bpm = Math.floor(clamp(70 + atoms * 1.2, 70, 120));

  // - 音符长度：由环数决定更“密/稀”
  const rings = props["Rings (count)"] || 0;
  const density = clamp(0.25 + rings * 0.08, 0.25, 0.55); // 越大越密
  // 生成 16 步主题
  const steps = 16;
  const notes = [];
  for (let i = 0; i < steps; i++) {
    const hit = rnd() < density;
    if (!hit) {
      notes.push(null);
      continue;
    }
    const deg = scale[Math.floor(rnd() * scale.length)];
    const octave = rnd() < 0.25 ? 12 : (rnd() < 0.1 ? -12 : 0);
    const midi = baseMidi + deg + octave;
    // 时值：1/8 或 1/16
    const dur = rnd() < 0.65 ? 0.5 : 0.25; // in beats
    notes.push({ midi, dur });
  }

  const themeId = `EL-${seed.toString(16).slice(0,8)}-${bpm}bpm`;
  return { props, seed, bpm, baseMidi, notes, themeId };
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function stopMusic() {
  for (const n of playingNodes) {
    try { n.stop && n.stop(); } catch {}
  }
  playingNodes = [];
}

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTheme(theme) {
  ensureAudio();
  stopMusic();

  const now = audioCtx.currentTime;
  const beat = 60 / theme.bpm;

  // 主旋律：sine + soft envelope
  // 低音：triangle drone
  const master = audioCtx.createGain();
  master.gain.value = 0.18;
  master.connect(audioCtx.destination);

  const drone = audioCtx.createOscillator();
  drone.type = "triangle";
  drone.frequency.value = midiToFreq(theme.baseMidi - 24);
  const droneGain = audioCtx.createGain();
  droneGain.gain.value = 0.06;
  drone.connect(droneGain).connect(master);
  drone.start(now);
  drone.stop(now + beat * 20);
  playingNodes.push(drone);

  let t = now + 0.05;

  // 简单打击：noise click（可选）
  const clickGain = audioCtx.createGain();
  clickGain.gain.value = 0.03;
  clickGain.connect(master);

  function scheduleClick(atTime) {
    const bufSize = Math.floor(audioCtx.sampleRate * 0.01);
    const buffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(clickGain);
    src.start(atTime);
    playingNodes.push(src);
  }

  // 每步 1/4 beat 网格（16步=4拍）
  const stepBeat = 0.25;
  const totalBeats = 16 * stepBeat;

  // 重复 4 次主题
  const repeats = 4;
  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < theme.notes.length; i++) {
      const stepTime = t + (r * totalBeats + i * stepBeat) * beat;

      // 点击节拍（每 4 步一个重拍）
      if (i % 4 === 0) scheduleClick(stepTime);

      const n = theme.notes[i];
      if (!n) continue;

      const osc = audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = midiToFreq(n.midi);

      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, stepTime);
      g.gain.exponentialRampToValueAtTime(0.10, stepTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, stepTime + n.dur * beat);

      osc.connect(g).connect(master);
      osc.start(stepTime);
      osc.stop(stepTime + n.dur * beat + 0.02);
      playingNodes.push(osc);
    }
  }
}

function refreshTheme() {
  const smiles = elSmiles.value.trim();
  if (!smiles) {
    alert("请先输入 SMILES");
    return null;
  }
  currentTheme = makeTheme(smiles);
  if (elThemeId) elThemeId.textContent = currentTheme.themeId;
  return currentTheme;
}

// Wire buttons if present
if (elMusicPlay && elMusicStop && elMusicRegen) {
  elMusicPlay.addEventListener("click", () => {
    const theme = currentTheme || refreshTheme();
    if (!theme) return;
    playTheme(theme);
  });

  elMusicStop.addEventListener("click", () => stopMusic());

on(elMusicPlay, "click", () => {
  try {
    const theme = currentTheme || refreshTheme();
    if (!theme) return;
    playTheme(theme);
  } catch (e) {
    setStatus("🎵 播放失败：" + String(e.message || e));
  }
});

on(elMusicStop, "click", () => stopMusic());

on(elMusicRegen, "click", () => {
  try {
    const smiles = elSmiles.value.trim();
    if (!smiles) return alert("请先输入 SMILES");
    const salt = Date.now().toString();
    const tmp = makeTheme(smiles + "|" + salt);
    currentTheme = tmp;
    if (elThemeId) elThemeId.textContent = tmp.themeId + "*";
    playTheme(tmp);
  } catch (e) {
    setStatus("🎵 重新生成失败：" + String(e.message || e));
  }
});
