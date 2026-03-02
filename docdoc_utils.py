import os
#from dotenv import load_dotenv

import openai
import pandas as pd
import streamlit as st
#from sympy import content

#from graph import invoke_our_graph
#from st_callable_util import get_streamlit_cb  # Utility function to get a Streamlit callback handler with context
#from streamlit.runtime.scriptrunner import  get_script_run_ctx

import docdoc_config as cfg

############## functions ######################
# session variables
def init_session_state(change_item_key):
    # application modes:
    if 'llm_result_saved_mode' not in st.session_state:
        st.session_state.llm_result_saved_mode = False
    if 'critique_review_mode' not in st.session_state:
        st.session_state.critique_review_mode = False
    if 'invoke_model_mode' not in st.session_state:
        st.session_state.invoke_model_mode = False
    if 'doc_define_mode' not in st.session_state:
        st.session_state.doc_define_mode = True  # initial mode
    if 'change_item_entry_mode' not in st.session_state:
        st.session_state.change_item_entry_mode = False
    if 'view_changed_document_mode' not in st.session_state:
        st.session_state.view_changed_document_mode = False

    # global variables:
    if 'llm_client' not in st.session_state:
        st.session_state.llm_client = None
    # if 'default_llm_anti_guidance' not in st.session_state:
    #     st.session_state.default_llm_anti_guidance = "Do not add new ideas into the document. " \
    #                     "Your job is to sharpen up what is already being communicated"
    if 'change_item_key' not in st.session_state:
        st.session_state.change_item_key = change_item_key

    # shared application structures:
    if 'prompt_content' not in st.session_state:
        st.session_state.prompt_content = None
    if 'document_to_be_reviewed_contents' not in st.session_state:
        # doc is created from llm client file create api
        st.session_state.document_to_be_reviewed_contents = None
    if 'response_document_path' not in st.session_state:
        st.session_state.response_document_path = None
    # if 'llm_critique_document_contents' not in st.session_state:
    #     st.session_state.llm_critique_document_contents = None
    if 'change_item_df' not in st.session_state:
        st.session_state.change_item_df = pd.DataFrame(columns=[change_item_key, 'Change Instruction'])
    # for local control of change item entries
    if 'change_item_submit' not in st.session_state:
        st.session_state.change_item_submit = False
    if 'saved_primary_document_topic' not in st.session_state:
        st.session_state.saved_primary_document_topic = None
    if 'saved_reviewer_objective' not in st.session_state:
        st.session_state.saved_reviewer_objective = None
    if 'saved_llm_guidance' not in st.session_state:
         st.session_state.saved_llm_guidance= None
    if 'saved_llm_anti_guidance' not in st.session_state:
         st.session_state.saved_llm_anti_guidance = None

    # definitions for what the llm is being used for
    if 'llm_use_reason' not in st.session_state:
        st.session_state.llm_use_reason = None
    if 'llm_document_critique' not in st.session_state:
        st.session_state.llm_document_critique = "llm_document_critique"
    if 'llm_apply_change_items' not in st.session_state:
        st.session_state.llm_apply_change_items = "llm_apply_change_items"


# Call back methods on buttons (controls state and container display)
def invoke_document_critique_clicked(container):
    st.session_state.doc_define_mode = False
    st.session_state.view_changed_document_mode = False
    st.session_state.invoke_model_mode = True
    st.session_state.llm_use_reason = st.session_state.llm_document_critique
    # save user inputs before emptying
    st.session_state.saved_primary_document_topic = st.session_state.primary_document_topic 
    st.session_state.saved_reviewer_objective = st.session_state.reviewer_objective
    st.session_state.saved_llm_guidance = st.session_state.llm_guidance
    st.session_state.saved_llm_anti_guidance = st.session_state.llm_anti_guidance
    create_critique_document_prompt()
    container.empty()
    
    print("invoke document critique button clicked")

def invoke_changed_document_critique_clicked(container):
    st.session_state.doc_define_mode = False
    st.session_state.view_changed_document_mode = False
    st.session_state.invoke_model_mode = True
    st.session_state.llm_use_reason = st.session_state.llm_document_critique
    container.empty()
    create_critique_changed_document_prompt()
    print("invoke changed document critique button clicked")

def view_critique_clicked(container):
    st.session_state.critique_review_mode = True
    st.session_state.llm_result_saved_mode = False
    st.session_state.change_item_entry_mode = True
    container.empty()
    print("view critique button clicked")

def view_changed_document_clicked(container):
    st.session_state.llm_result_saved_mode = False
    st.session_state.view_changed_document_mode = True
    container.empty()
    print("view changed document button clicked")

def exit_review_clicked(container):
    st.session_state.critique_review_mode = False
    st.session_state.doc_define_mode = True
    container.empty()
    print("exit review button clicked")

def create_change_item_clicked():
    st.session_state.change_item_submit=True
    print("create change item button clicked")

def apply_change_items_clicked(container):
    container.empty()
    st.session_state.change_item_entry_mode = False
    st.session_state.critique_review_mode = False
    # future - persist the list of changes applied before clearing the CI table on UI
    st.session_state.change_item_df = pd.DataFrame(columns=[st.session_state.change_item_key, 'Change Instruction'])
    create_apply_change_items_prompt()
    print("apply change items button clicked")


# gather input to identify doc and related information needed for prompting the LLM
def doc_define(container):
    #label_color="purple"
    #st.write("### Enter your primary document to be reviewed:")
    #st.write("-------------") 
    col1, col2 = st.columns(2)
    with col1:
        st.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.PRIMARY_DOC_SELECT_LABEL}</h2>", unsafe_allow_html=True)
        st.file_uploader(cfg.PRIMARY_DOC_SELECT_LABEL,
                                        label_visibility="collapsed",
                                        key="document_to_be_reviewed",
                                        type=["pdf"], width = "stretch")
    with col2:
        st.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.PRIMARY_DOC_TOPIC_LABEL}</h2>", unsafe_allow_html=True)
        st.text_area(label=cfg.PRIMARY_DOC_TOPIC_LABEL, 
                                        label_visibility="collapsed",
                                        value=cfg.PRIMARY_DOC_TOPIC_DEFAULT_INPUT,
                                        key="primary_document_topic",
                                        height=cfg.TEXT_AREA_HEIGHT)
    st.markdown("<hr>", unsafe_allow_html=True)   
    col1, col2 = st.columns(2)
    with col1:
        st.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.PRIMARY_DOC_MAIN_OBJECTIVE_LABEL}</h2>", unsafe_allow_html=True)
        st.text_area(label=cfg.PRIMARY_DOC_MAIN_OBJECTIVE_LABEL, 
                                        label_visibility="collapsed",
                                    value=cfg.PRIMARY_DOC_MAIN_OBJECTIVE_DEFAULT_INPUT,
                                    key="reviewer_objective",
                                    height="stretch")
    with col2:
        st.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.PRIMARY_DOC_RESPONSE_GUIDANCE_LABEL}</h2>", unsafe_allow_html=True)
        st.text_area(label=cfg.PRIMARY_DOC_RESPONSE_GUIDANCE_LABEL,
                            label_visibility="collapsed", 
                            value=cfg.PRIMARY_DOC_RESPONSE_GUIDANCE_DEFAULT_INPUT,
                            key="llm_guidance",
                            height="content")
        st.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.PRIMARY_DOC_RESPONSE_ANTI_GUIDANCE_LABEL}</h2>", unsafe_allow_html=True)
        st.text_area(label=cfg.PRIMARY_DOC_RESPONSE_ANTI_GUIDANCE_LABEL,
                                label_visibility="collapsed",
                                value=cfg.PRIMARY_DOC_RESPONSE_ANTI_GUIDANCE_DEFAULT_INPUT,
                                key="llm_anti_guidance",
                                height="content")
    st.markdown("<hr>", unsafe_allow_html=True)    
    col1, col2 = st.columns(2)
    with col1:
        st.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.SUPPORTING_DOC_SELECT_LABEL}</h2>", unsafe_allow_html=True)
        st.file_uploader(cfg.SUPPORTING_DOC_SELECT_LABEL,
                                label_visibility="collapsed", 
                                type=["pdf"], key="supporting_document")
        st.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.SUPPORTING_DOC_CONTEXT_LABEL}</h2>", unsafe_allow_html=True)
        st.text_area(cfg.SUPPORTING_DOC_CONTEXT_LABEL,
                                    label_visibility="collapsed", 
                                    key="supporting_document_instructions",
                                    height="content")
    with col2: 
        st.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.PRIOR_RESPONSE_SELECT_LABEL}</h2>", unsafe_allow_html=True)
        st.file_uploader(cfg.PRIOR_RESPONSE_SELECT_LABEL, 
                                label_visibility="collapsed",
                                type=["pdf"], key="prior_response_document")
        st.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.PRIOR_RESPONSE_CONTEXT_LABEL}</h2>", unsafe_allow_html=True)
        st.text_area(label=cfg.PRIOR_RESPONSE_CONTEXT_LABEL, 
                                label_visibility="collapsed",
                                value="",
                                key="prior_response_document_instructions",
                                height="content")

    st.sidebar.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.PRIMARY_DOC_RESPONSE_PATH_LABEL}</h2>", unsafe_allow_html=True)
    st.markdown("<hr>", unsafe_allow_html=True)   
    st.sidebar.text_input(cfg.PRIMARY_DOC_RESPONSE_PATH_LABEL, 
                                    label_visibility="collapsed",
                                    value="critique_output.md",
                                    key="llm_critique_output_path")
    st.sidebar.markdown("<hr>", unsafe_allow_html=True)
    st.sidebar.button(label=cfg.PRIMARY_DOC_INVOKE_BUTTON_LABEL,
                                on_click=invoke_document_critique_clicked
                            ,args=(container,)
                            ,key="invoke_document_critique_button")
    
  

# invoke model - call LLM to perform critique and save results
def invoke_model():
    print(f"prompt_content: {st.session_state.prompt_content}")
    print(f"response_document_path: {st.session_state.response_document_path}")
    model="gpt-5-mini" # 5-nano",
    print(f"... invoking model {model} ...") 
    with st.spinner(f"{cfg.LLM_PROCESSING_LABEL}"):
        if cfg.MODEL_BYPASS_SWITCH:
            print("MODEL_BYPASS_SWITCH is ON - using placeholder response")
            class Response:
                def __init__(self, output_text):
                    self.output_text = output_text
            llm_response = Response("This is a placeholder response generated because MODEL_BYPASS_SWITCH is set to True.")
        else:
            llm_response = st.session_state.llm_client.responses.create(
                model=model,
                input=[
                    {"role": "system", "content": cfg.LLM_SYSTEM_ROLE_PROMPT},
                    {"role": "user", "content": st.session_state.prompt_content}],
                stream=False,)  
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    print("model response received .... saving to output file: ", st.session_state.response_document_path)
    with open(st.session_state.response_document_path, "w", encoding="utf-8") as f:
        f.write(llm_response.output_text)
    st.session_state.llm_result_saved_mode = True
    st.session_state.invoke_model_mode = False
    print("output file saved")

# llm_result - show critique completed message with view critique button
def llm_result(container):
    print("st.session_state.llm_use_reason: ",st.session_state.llm_use_reason)
    if st.session_state.llm_use_reason == st.session_state.llm_document_critique:
        st.success(f"Document critique completed. Output saved to {st.session_state.response_document_path}") 
        st.sidebar.button(label="View Critique"
                    , on_click=view_critique_clicked
                    , args=(container,)
                    ,key="view_critique_button")
    elif st.session_state.llm_use_reason == st.session_state.llm_apply_change_items:
        st.success(f"Applying change items completed. Output saved to {st.session_state.response_document_path}") 
        st.sidebar.button(label="View Changed Document"
                    , on_click=view_changed_document_clicked
                    , args=(container,)
                    ,key="view_changed_document_button")

# critique_review - show the critique content and create change items
def critique_review(container):    
    # display critique to the user
    with open(st.session_state.response_document_path, "r", encoding="utf-8") as f:   
        llm_critique_document_contents = f.read()
    st.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.CRITIQUE_CONTENT_LABEL}</h2>", unsafe_allow_html=True)
    st.text_area(cfg.CRITIQUE_CONTENT_LABEL,label_visibility="collapsed", value=llm_critique_document_contents, height=800) 
    st.sidebar.button(label=cfg.EXIT_REVIEW_BUTTON_LABEL
                , on_click=exit_review_clicked
                , args=(container,)
                ,key="exit_review_button")
    st.sidebar.markdown("<hr>", unsafe_allow_html=True)
    if st.session_state.change_item_entry_mode:
        col1, col2 = st.columns(2)
        with col1:
            st.sidebar.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.CHANGE_ITEM_ID_LABEL}</h2>", unsafe_allow_html=True)
            st.sidebar.text_input(cfg.CHANGE_ITEM_ID_LABEL, label_visibility="collapsed", value=" ", key="change_id_input")
        with col2:
            st.sidebar.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.CHANGE_ITEM_INSTRUCTION_LABEL}</h2>", unsafe_allow_html=True)
            st.sidebar.text_input(cfg.CHANGE_ITEM_INSTRUCTION_LABEL,label_visibility="collapsed", key="change_instruction_input",value="make the change as recommended")
        st.sidebar.button(label=cfg.CREATE_CHANGE_ITEM_BUTTON_LABEL,on_click=create_change_item_clicked)
        if st.session_state.change_item_submit and (st.session_state.change_id_input or not st.session_state.change_id_input.isspace()): 
            # Create a new DataFrame with the input data
            new_row = pd.DataFrame([{st.session_state.change_item_key: st.session_state.change_id_input.strip(), 'Change Instruction': st.session_state.change_instruction_input}])
            # check for duplicate change item
            ci_key_list = [st.session_state.change_item_key]
            print("ci_key_list: ", ci_key_list)
            print("new_row: ", new_row)
            is_duplicate = (st.session_state.change_item_df[ci_key_list] == pd.Series(new_row.iloc[0])[ci_key_list]).all(axis=1).any()  
            if not is_duplicate:
                #print("st.session_state.change_item_df before addition: ", st.session_state.change_item_df)
                st.session_state.change_item_df = pd.concat([st.session_state.change_item_df, new_row], ignore_index=True)
                #print("st.session_state.change_item_df after addition: ", st.session_state.change_item_df)
            else:
                st.sidebar.warning(f"Change Item with {st.session_state.change_item_key} '{st.session_state.change_id_input}' already exists. Please enter a unique identifier.")
            st.session_state.change_item_submit = False

        # --- Data Display ---
        st.sidebar.markdown("<hr>", unsafe_allow_html=True)
        st.sidebar.markdown(f"<h2 style='{cfg.SIDEBAR_SUBHEADER_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.CHANGE_ITEM_DATASET_LABEL}</h2>", unsafe_allow_html=True)
        
        if not st.session_state.change_item_df.empty:
            # Display the DataFrame as a data_editor with key column non-editable
            #print("change_item_df: ", st.session_state.change_item_df)
            st.sidebar.data_editor(st.session_state.change_item_df, width='stretch', hide_index=True, num_rows="dynamic"
                , column_config={"ID": st.column_config.TextColumn(cfg.CHANGE_ITEMS_ID_COLUMN, width="small"),
                                "Instruction": st.column_config.TextColumn(cfg.CHANGE_ITEMS_INSTRUCTION_COLUMN, width="large"),}
                , disabled=[st.session_state.change_item_key])
            #print("st.session_state.change_item_df: ", st.session_state.change_item_df)
            st.sidebar.markdown("<hr>", unsafe_allow_html=True)
            st.sidebar.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.APPLY_CHANGES_RESPONSE_PATH_LABEL}</h2>", unsafe_allow_html=True)
            print("st.session_state.response_document_path: ", st.session_state.response_document_path) 
            st.sidebar.text_input(cfg.APPLY_CHANGES_RESPONSE_PATH_LABEL, 
                            label_visibility="collapsed", key="changed_document_path", value="critique_output_applied.md")
            st.sidebar.button(cfg.APPLY_CHANGES_BUTTON_LABEL,on_click=apply_change_items_clicked,args=(container,))
        else:
            st.info("No entries saved yet.")

def view_changed_document(container):
    with open(st.session_state.response_document_path, "r", encoding="utf-8") as f:   
        changed_document_contents = f.read()
    st.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.CHANGED_DOC_CONTENT_LABEL}</h2>", unsafe_allow_html=True)
    st.text_area(cfg.CHANGED_DOC_CONTENT_LABEL, 
                            label_visibility="collapsed",value=changed_document_contents, height=800) 
    st.sidebar.button(label=cfg.EXIT_REVIEW_BUTTON_LABEL
                , on_click=exit_review_clicked
                , args=(container,)
                ,key="exit_review_button")
    st.sidebar.markdown("<hr>", unsafe_allow_html=True)
    st.sidebar.markdown(f"<h2 style='{cfg.LABEL_PIXEL_SIZE}; {cfg.LABEL_COLOR};'>{cfg.CHANGED_DOC_RESPONSE_PATH_LABEL}</h2>", unsafe_allow_html=True)
    st.sidebar.text_input(cfg.CHANGED_DOC_RESPONSE_PATH_LABEL, 
                            label_visibility="collapsed", 
                            value="critique_output.md", key="llm_critique_output_path")
    # st.session_state.response_document_path = st.session_state.critique_output_path
    st.sidebar.button(label=cfg.CRITIQUE_CHANGED_DOC_BUTTON_LABEL,
                on_click=invoke_changed_document_critique_clicked
                ,args=(container,)
                ,key="critique_changed_document_button")
    
def create_critique_document_prompt():
    print("create_critique_document_prompt")
    content = []
    print("document_to_be_reviewed: ", st.session_state.document_to_be_reviewed)
    # print("document_to_be_reviewed_name: ", st.session_state.document_to_be_reviewed.name if st.session_state.document_to_be_reviewed else "No file uploaded")
    st.session_state.document_to_be_reviewed_contents=\
                    st.session_state.llm_client.files.create(file=st.session_state.document_to_be_reviewed, purpose="user_data") 
    print("document_to_be_reviewed_contents: ", st.session_state.document_to_be_reviewed_contents)
    content.append({"type": "input_text", "text": f"Primary document to critique. \
                    Topic: {st.session_state.saved_primary_document_topic} \
                    Objective: {st.session_state.saved_reviewer_objective} \
                    Guidance: {st.session_state.saved_llm_guidance} \
                    Anti-Guidance: {st.session_state.saved_llm_anti_guidance}"})
    content.append({"type": "input_file", "file_url": st.session_state.document_to_be_reviewed_contents.id})
    if st.session_state.supporting_document:
        supporting_document_contents=st.session_state.llm_client.files.create(file=st.session_state.supporting_document, purpose="user_data")
        content.append({"type": "input_text", "text": f"Supporting document. Instructions: {st.session_state.supporting_document_instructions}"})
        content.append({"type": "input_file", "file_url": supporting_document_contents.id})
    if st.session_state.prior_response_document:
        prior_response_document_contents=st.session_state.llm_client.files.create(file=st.session_state.prior_response_document, purpose="user_data")
        content.append({"type": "input_text", "text": f"Prior response document. Instructions: {st.session_state.prior_response_document_instructions}"})
        content.append({"type": "input_file", "file_url": prior_response_document_contents.id})
    st.session_state.prompt_content = content
    # print(f"prompt_content: {st.session_state.prompt_content}") 
    st.session_state.response_document_path = st.session_state.llm_critique_output_path
    # print(f"response_document_path: {st.session_state.response_document_path}")  
    
def create_apply_change_items_prompt():
    print("create_apply_change_items_prompt")
    #load the critique content from the saved file
    # with open(st.session_state.response_document_path, "rb") as f: 
        # st.session_state.llm_critique_file_contents=\
        #     st.session_state.llm_client.files.create(file=f, purpose="user_data") #"assistants")
    with open(st.session_state.response_document_path, "r", encoding="utf-8") as f:
        llm_critique_document_contents=f.read()
    ci_csv=st.session_state.change_item_df.to_csv(index=False)
    content = []
    main_instruction = cfg.APPLY_CHANGES_MAIN_LLM_INSTRUCTION
    content.append({"type": "input_text", "text": f"Main Instruction: {main_instruction} \
                    Anti-Guidance: {cfg.PRIMARY_DOC_RESPONSE_ANTI_GUIDANCE_DEFAULT_INPUT}"})
    content.append({"type": "input_text", "text": f"Change Items: {ci_csv}"})
    content.append({"type": "input_text", "text": "Original Document: " })
    content.append({"type": "input_file", "file_url": st.session_state.document_to_be_reviewed_contents.id})
    content.append({"type": "input_text", "text": f"Original Critique: {llm_critique_document_contents}"})
    # content.append({"type": "input_file", "file_url": st.session_state.llm_critique_file_contents.id})
    # print("change prompt:", content)
    st.session_state.response_document_path = st.session_state.changed_document_path
    st.session_state.prompt_content = content
    st.session_state.invoke_model_mode = True
    st.session_state.llm_use_reason = st.session_state.llm_apply_change_items
    # with st.spinner("Change items are being applied ....."):
    #     invoke_model()
    # st.success("Change items have been applied.")
    # local_container.empty()
    # with open(st.session_state.response_document_path, "r", encoding="utf-8") as f:
    #     llm_changed_document=f.read()
    # st.text_area("Changed Document Content", value=llm_changed_document, height=800)
    # st.sidebar.button(label="Exit Review"
    #             , on_click=exit_review_clicked, args=(container,) ) 
    # st.sidebar.button(label="Critique Changed Document"
    #             , on_click=critique_changed_document_clicked, args=(container,) ) 
    
def create_critique_changed_document_prompt():
    print("create_critique_changed_document_prompt")
    # get last response
    with open(st.session_state.response_document_path, "r", encoding="utf-8") as f:
        llm_changed_document_contents=f.read()
    ci_csv=st.session_state.change_item_df.to_csv(index=False)
    content = []
    content.append({"type": "input_text", "text": f"{cfg.CRITIQUE_CHANGED_DOC_MAIN_LLM_INSTRUCTION} \
                        Document Topic: {st.session_state.saved_primary_document_topic} \
                        Objective: {st.session_state.saved_reviewer_objective} \
                        Guidance: {st.session_state.saved_llm_guidance} \
                        Anti-Guidance: {st.session_state.saved_llm_anti_guidance}"})
    content.append({"type": "input_text", "text": f"Primary Document Body: {llm_changed_document_contents}"})
    # set next response output
    st.session_state.response_document_path = st.session_state.llm_critique_output_path
    st.session_state.prompt_content = content
    # this will cause llm to be invoked
    st.session_state.invoke_model_mode = True
    st.session_state.llm_use_reason = st.session_state.llm_document_critique
   