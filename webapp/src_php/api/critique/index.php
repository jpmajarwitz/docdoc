<?php
require_once dirname(__DIR__, 2) . '/lib/bootstrap.php';
$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');

$llmRequest = php_backend_parse_form_request();
$response = php_backend_invoke_llm($llmRequest, [
    'primary_document' => isset($_FILES['primary_document']) ? $_FILES['primary_document'] : null,
    'supporting_document' => isset($_FILES['supporting_document']) ? $_FILES['supporting_document'] : null,
    'prior_response_document' => isset($_FILES['prior_response_document']) ? $_FILES['prior_response_document'] : null,
], $config);

php_backend_json_response(200, $response);
