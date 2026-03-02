
# switches
MODEL_BYPASS_SWITCH=False

# constants
MAIN_HEADER_PIXEL_SIZE="font-size: 32px"
MAIN_SUBHEADER_PIXEL_SIZE="font-size: 28px"
SIDEBAR_HEADER_PIXEL_SIZE="font-size: 28px"
SIDEBAR_SUBHEADER_PIXEL_SIZE="font-size: 24px"
HEADER_COLOR="color: purple"
SUBHEADER_COLOR="color: black"
LABEL_COLOR="color: purple"
LABEL_PIXEL_SIZE="font-size: 18px"

TEXT_AREA_HEIGHT=120

# labels
# MAIN_PRODUCT_LABEL="Professional Document Review and Critique Tool"
MAIN_PRODUCT_LABEL="The Document Doctor: "
MAIN_PRODUCT_SUBLABEL="A Professional Review and Critique Tool"
PRIMARY_DOC_SELECT_LABEL="Select the document to be reviewed"
PRIMARY_DOC_TOPIC_LABEL="Describe the primary topic of the document"
PRIMARY_DOC_MAIN_OBJECTIVE_LABEL="Enter the main objectives for the review"
PRIMARY_DOC_RESPONSE_GUIDANCE_LABEL="Enter formatting guidance for the response"
PRIMARY_DOC_RESPONSE_ANTI_GUIDANCE_LABEL="Enter any anti-guidance or things to avoid in the review"
SUPPORTING_DOC_SELECT_LABEL="Select supporting documents"
SUPPORTING_DOC_CONTEXT_LABEL="Enter any context for the supporting documents"
PRIOR_RESPONSE_SELECT_LABEL="Select a prior response document to consider"
PRIOR_RESPONSE_CONTEXT_LABEL="Enter any context for the prior response document"
PRIMARY_DOC_RESPONSE_PATH_LABEL="Enter the output path for the result"
CHANGED_DOC_RESPONSE_PATH_LABEL="Enter the output path for the critique output"
APPLY_CHANGES_RESPONSE_PATH_LABEL="Enter the output path for changed document output"
PRIMARY_DOC_INVOKE_BUTTON_LABEL="Critique Primary Document"
LLM_PROCESSING_LABEL="LLM is being accessed ....."
CRITIQUE_CONTENT_LABEL="Critique Content"
CHANGED_DOC_CONTENT_LABEL="Changed Document Content"
EXIT_REVIEW_BUTTON_LABEL="Exit Review"
CHANGE_ITEM_ID_LABEL="Enter the change item name or number"
CHANGE_ITEM_INSTRUCTION_LABEL="Enter the change instruction"
CHANGE_ITEM_DATASET_LABEL="Change Items"
CREATE_CHANGE_ITEM_BUTTON_LABEL="Create Change Item"
CRITIQUE_CHANGED_DOC_BUTTON_LABEL="Critique Changed Document"
APPLY_CHANGES_BUTTON_LABEL="Apply Changes"
CHANGE_ITEMS_ID_COLUMN="Change ID"
CHANGE_ITEMS_INSTRUCTION_COLUMN="Change Instruction"


# default inputs
PRIMARY_DOC_TOPIC_DEFAULT_INPUT="This is a professional journal article in the <XXX> profession covering <YYY>"
PRIMARY_DOC_MAIN_OBJECTIVE_DEFAULT_INPUT="Proofread the document for consistency in tone, scope, and level of detail. " \
                                    "Consider the document to be a refined draft that is complete in scope and intent. " \
                                    "Suggest improvements only where necessary."
PRIMARY_DOC_RESPONSE_GUIDANCE_DEFAULT_INPUT=" Your response should be in Markdown format. Provide a section of major changes needed " \
                            "and a section of minor changes needed. " \
                            "Use enumerations for each change recommended, e.g., major-1, major-2,... minor-1, minor2 .... "
PRIMARY_DOC_RESPONSE_ANTI_GUIDANCE_DEFAULT_INPUT="Do not add new ideas into the document. " \
                            "Your job is to sharpen up what is already being communicated"
LLM_SYSTEM_ROLE_PROMPT="You are a highly skilled assistant to an experienced professional in the field indicated."
APPLY_CHANGES_MAIN_LLM_INSTRUCTION="n an earlier response, you provided a critique of a document, suggesting major and minor changes.  " \
    "Attached is a document listing of the changes I would like you to apply, with an instruction for each change. " \
    "Apply all changes directly to the original document and return it in the same format " \
    "Included for reference is the original document to apply the changes to and your original critique with the change details"
CRITIQUE_CHANGED_DOC_MAIN_LLM_INSTRUCTION="Critique the included document using the instructions provided."

