const $ = (id) => document.getElementById(id);

const elSmiles = $("smiles");
const elAnalyze = $("analyze");
const elDemo = $("demo");
const elSvg = $("molSvg");
const elProps = $("props");
const elAi = $("aiExplain");
const elAiOut = $("aiOut");

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

// AI button is placeholder for next step (Cloudflare Worker)
elAi.addEventListener("click", () => {
  alert("AI 解释模块下一步上线：将通过 Cloudflare Worker /api/explain 提供服务端密钥保护。");
});
