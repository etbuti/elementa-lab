import streamlit as st

st.set_page_config(page_title="Elementa Lab", layout="centered")
st.title("🧪 Elementa Lab")
st.caption("输入分子 SMILES → 计算性质 → （可选）AI 解释")

# ---------- RDKit: 计算分子性质 ----------
@st.cache_data(show_spinner=False)
def calc_props(smiles: str):
    from rdkit import Chem
    from rdkit.Chem import Descriptors, Lipinski, Crippen
    from rdkit.Chem.rdMolDescriptors import CalcTPSA

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None, None

    props = {
        "Molecular Weight (MolWt)": round(Descriptors.MolWt(mol), 4),
        "LogP (Crippen)": round(Crippen.MolLogP(mol), 4),
        "TPSA": round(CalcTPSA(mol), 4),
        "H-bond Donors": int(Lipinski.NumHDonors(mol)),
        "H-bond Acceptors": int(Lipinski.NumHAcceptors(mol)),
        "Rotatable Bonds": int(Lipinski.NumRotatableBonds(mol)),
        "Ring Count": int(Lipinski.RingCount(mol)),
        "Heavy Atom Count": int(Descriptors.HeavyAtomCount(mol)),
    }
    return mol, props

@st.cache_data(show_spinner=False)
def draw_mol_png(smiles: str):
    from rdkit import Chem
    from rdkit.Chem import Draw
    from io import BytesIO

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    img = Draw.MolToImage(mol, size=(420, 420))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

# ---------- OpenAI: AI 文本解释 ----------
def ai_explain(smiles: str, props: dict):
    # Secrets 来自 Streamlit Cloud 的 secrets 配置
    api_key = st.secrets.get("OPENAI_API_KEY", "")
    if not api_key:
        return "⚠️ 未设置 OPENAI_API_KEY。请在 Streamlit Cloud 的 Secrets 中添加。"

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    # 给模型的输入：SMILES + 一组性质（简洁）
    props_lines = "\n".join([f"- {k}: {v}" for k, v in props.items()])
    prompt = f"""
你是一位严谨但通俗的化学讲解者。请基于以下信息做解释：
SMILES: {smiles}

Predicted properties:
{props_lines}

请输出（中文）：
1) 这组性质大致意味着什么（极性/疏水性、可能溶解性趋势等）
2) 结构层面可能的官能团/特点（可推断就说，别胡编）
3) 可能的用途方向（用“可能/倾向”措辞，不要当成事实）
4) 一句安全提示：不要据此进行任何危险实验或合成

长度：200~320 字。
"""

    # 使用官方推荐的 Responses API
    resp = client.responses.create(
        model="gpt-4o-mini",
        input=prompt,
    )
    return resp.output_text.strip()

# ---------- UI ----------
smiles = st.text_input("SMILES（例如：CCO / 阿司匹林：CC(=O)OC1=CC=CC=C1C(=O)O）", value="CCO").strip()

colA, colB = st.columns([1, 1])
with colA:
    run_calc = st.button("🔬 计算分子性质", use_container_width=True)
with colB:
    run_ai = st.button("🧠 生成 AI 解释（需要 Key）", use_container_width=True)

if run_calc or run_ai:
    with st.spinner("处理中..."):
        try:
            mol, props = calc_props(smiles)
        except Exception as e:
            st.error(f"RDKit 计算失败：{e}")
            st.stop()

    if mol is None:
        st.error("❌ 无法解析该 SMILES，请检查格式。")
        st.stop()

    st.subheader("📊 分子性质（RDKit）")
    st.json(props)

    png_bytes = None
    try:
        png_bytes = draw_mol_png(smiles)
    except Exception:
        png_bytes = None

    if png_bytes:
        st.subheader("🧬 分子结构图")
        st.image(png_bytes, caption="RDKit render", use_container_width=False)
        st.download_button("⬇️ 下载结构图 PNG", data=png_bytes, file_name="molecule.png", mime="image/png")

    if run_ai:
        st.subheader("🧠 AI 文本解释")
        with st.spinner("让模型写解释中..."):
            try:
                text = ai_explain(smiles, props)
                st.write(text)
            except Exception as e:
                st.error(f"AI 解释失败：{e}")

st.divider()
st.caption("Founder: Xiaojun Yin · Guarantor: Goldisle Light Org Ltd (UK)")
