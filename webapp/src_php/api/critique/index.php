<?php
require_once dirname(__DIR__, 2) . '/lib/auth.php';
$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
auth_require_active_session($config);

$llmRequest = php_backend_parse_form_request();
$fileMap = [
    'primary_document' => isset($_FILES['primary_document']) ? $_FILES['primary_document'] : null,
    'supporting_document' => isset($_FILES['supporting_document']) ? $_FILES['supporting_document'] : null,
    'job_description_document' => isset($_FILES['job_description_document']) ? $_FILES['job_description_document'] : null,
    'prior_response_document' => isset($_FILES['prior_response_document']) ? $_FILES['prior_response_document'] : null,
    'vtt_file' => isset($_FILES['vtt_file']) ? $_FILES['vtt_file'] : null,
    'chat_file' => isset($_FILES['chat_file']) ? $_FILES['chat_file'] : null,
];
foreach ($_FILES as $fieldName => $upload) {
    if (preg_match('/^Resume_[1-9][0-9]*$/', (string) $fieldName)) {
        $fileMap[$fieldName] = $upload;
    }
}
$response = php_backend_invoke_llm($llmRequest, $fileMap, $config);

php_backend_json_response(200, $response);
