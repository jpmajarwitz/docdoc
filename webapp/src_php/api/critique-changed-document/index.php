<?php
require_once dirname(__DIR__, 2) . '/lib/bootstrap.php';
$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');

$llmRequest = php_backend_parse_json_request();
$response = php_backend_invoke_llm($llmRequest, [], $config);
php_backend_json_response(200, $response);
