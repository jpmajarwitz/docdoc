import os
from dotenv import load_dotenv

import openai
import pandas as pd
import streamlit as st

import docdoc_utils as utils
from docdoc_utils import init_session_state, doc_define, invoke_model, llm_result, critique_review
import docdoc_config as cfg
load_dotenv()

st.set_page_config(layout="wide") # Must be the first Streamlit command

# Check if the OpenAI API key is set
if not os.getenv('OPENAI_API_KEY'):
    # If not, display a sidebar input for the user to provide the API key
    st.sidebar.header("OPENAI_API_KEY Setup")
    api_key = st.sidebar.text_input(label="API Key", type="password", label_visibility="collapsed")
    os.environ["OPENAI_API_KEY"] = api_key
    # If no key is provided, show an info message and stop further execution and wait till key is entered
    if not api_key:
        st.info("Please enter your OPENAI_API_KEY in the sidebar.")
        st.stop()

change_item_key="Change ID"
init_session_state(change_item_key) #dependent on key_column
st.session_state.llm_client = openai.OpenAI()

#st.sidebar()
st.markdown(
    """
    <style>
        [data-testid="stSidebar"] {
            min-width: 400px;
            max-width: 800px;
            padding-top: 1rem;
            padding-bottom: 0rem;
        }
    </style>
    """,
    unsafe_allow_html=True,
)
st.markdown("""
<style>
.block-container {
    padding-top: 1rem; /* Adjust this value as needed */
    padding-bottom: 0rem;
}
</style>
""", unsafe_allow_html=True)

#st.title("Professional Document Review and Critique Tool")
st.markdown(f"<P> <span style='{cfg.MAIN_HEADER_PIXEL_SIZE}; {cfg.HEADER_COLOR};'><B>{cfg.MAIN_PRODUCT_LABEL}</B></span> \
            <span style='{cfg.MAIN_SUBHEADER_PIXEL_SIZE}; {cfg.HEADER_COLOR};'><B>{cfg.MAIN_PRODUCT_SUBLABEL}</B></span> \
            </P>", unsafe_allow_html=True)


# initial mode - doc_define_mode - gather input to identify doc and related information needed for prompting the LLM
doc_define_container=st.empty()
if st.session_state.doc_define_mode:
    print("doc_define_mode - critique_review_mode: " + str(st.session_state.critique_review_mode))
    print("doc_define_mode - llm_result_saved_mode: " + str(st.session_state.llm_result_saved_mode))
    with doc_define_container.container():
        st.sidebar.markdown(f"<h2 style='{cfg.SIDEBAR_HEADER_PIXEL_SIZE}; {cfg.HEADER_COLOR};'>Document Definition Mode</h2>", unsafe_allow_html=True)
        doc_define(doc_define_container)

# invoke_model_mode - call LLM to perform critique and save results
if st.session_state.invoke_model_mode:
    print("invoke_model_mode - critique_review_mode: " + str(st.session_state.critique_review_mode))
    print("invoke_model_mode - llm_result_saved_mode: " + str(st.session_state.llm_result_saved_mode))
    invoke_model()

# llm_result_saved_mode - show critique completed message with view critique button
llm_result_container=st.empty()
if st.session_state.llm_result_saved_mode: 
    print("llm_result_saved_mode - critique_review_mode: " + str(st.session_state.critique_review_mode))
    print("llm_result_saved_mode - llm_result_saved_mode: " + str(st.session_state.llm_result_saved_mode))
    with llm_result_container.container():
        st.sidebar.markdown(f"<h2 style='{cfg.SIDEBAR_HEADER_PIXEL_SIZE}; {cfg.HEADER_COLOR};'>LLM Result Saved Mode</h2>", unsafe_allow_html=True)
        llm_result(llm_result_container)     
    print("crit but displayed")
    print("result container: " + str(llm_result_container))

# critique_review_mode - show the critique content and create change items
critique_review_container=st.empty()
if st.session_state.critique_review_mode == True:
    print("critique_review_mode - critique_review_mode: " + str(st.session_state.critique_review_mode))
    print("critique_review_mode - llm_result_saved_mode: " + str(st.session_state.llm_result_saved_mode))
    print("review container: " + str(critique_review_container))
    with critique_review_container.container():
        st.sidebar.markdown(f"<h2 style='{cfg.SIDEBAR_HEADER_PIXEL_SIZE}; {cfg.HEADER_COLOR};'>Critique Review Mode</h2>", unsafe_allow_html=True)
        critique_review(critique_review_container)

view_changed_document_container=st.empty()
if st.session_state.view_changed_document_mode == True:
    print("view_changed_document_mode - critique_review_mode: " + str(st.session_state.critique_review_mode))
    with view_changed_document_container.container():
        st.sidebar.markdown(f"<h2 style='{cfg.SIDEBAR_HEADER_PIXEL_SIZE}; {cfg.HEADER_COLOR};'>View Changed Document Mode</h2>", unsafe_allow_html=True)
        utils.view_changed_document(view_changed_document_container)   
        
          
print("********** END OF DOC CRITIQUE APP **********")

