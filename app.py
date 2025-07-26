import streamlit as st

st.title("Elementa Lab")
st.write("🚧 实验中：输入分子 SMILES 字符串，即可分析性质。")

smiles = st.text_input("输入 SMILES:")

if smiles:
    st.write(f"你输入的分子是：{smiles}")
    st.success("（接下来可添加计算模块）")
