const $ = (id) => document.getElementById(id);

const elSmiles = $("smiles");
const elAnalyze = $("analyze");
const elDemo = $("demo");
const elSvg = $("molSvg");
const elProps = $("props");
const elAi = $("aiExplain");
const elAiOut = $("aiOut");
const elKey = $("openaiKey");

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

elAnalyze.addEventListener("click", analyze);

elDemo.addEventListener("click", () => {
  // Aspirin
  elSmiles.value = "CC(=O)OC1=CC=CC=C1C(=O)O";
  analyze();
});

// Enter to analyze
elSmiles.addEventListener("keydown", (e) => {
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
