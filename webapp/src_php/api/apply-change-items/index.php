<?php
require_once dirname(__DIR__, 2) . '/lib/auth.php';
$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
auth_require_active_session($config);

$llmRequest = php_backend_parse_form_request();
$fileMap = [
    'original_document' => isset($_FILES['original_document']) ? $_FILES['original_document'] : null,
    'job_description_document' => isset($_FILES['job_description_document']) ? $_FILES['job_description_document'] : null,
];
foreach ($_FILES as $fieldName => $upload) {
    if (preg_match('/^Resume_[1-9][0-9]*$/', (string) $fieldName)) {
        $fileMap[$fieldName] = $upload;
    }
}
$response = php_backend_invoke_llm($llmRequest, $fileMap, $config);

php_backend_json_response(200, $response);
