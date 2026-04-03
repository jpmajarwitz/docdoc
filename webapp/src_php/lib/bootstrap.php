<?php

if (!function_exists('php_backend_register_error_handlers')) {
    function php_backend_register_error_handlers()
    {
        set_exception_handler(function ($exception) {
            if (!headers_sent()) {
                http_response_code(500);
                header('Content-Type: application/json');
            }
            echo json_encode([
                'detail' => 'Backend exception: ' . $exception->getMessage(),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            exit;
        });
    }
}

php_backend_register_error_handlers();

function php_backend_load_config()
{
    $configPath = dirname(__DIR__) . '/config.php';
    if (file_exists($configPath)) {
        $loaded = require $configPath;
        if (is_array($loaded)) {
            return $loaded;
        }
    }

    return [];
}

function php_backend_apply_cors($config)
{
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim($_SERVER['HTTP_ORIGIN']) : '';
    $allowedOrigins = [];

    if (!empty($config['cors_allow_origins']) && is_array($config['cors_allow_origins'])) {
        $allowedOrigins = $config['cors_allow_origins'];
    }

    $envOrigins = getenv('CORS_ALLOW_ORIGINS');
    if ($envOrigins) {
        $allowedOrigins = array_merge($allowedOrigins, array_map('trim', explode(',', $envOrigins)));
    }

    $allowedOrigins = array_values(array_filter(array_unique($allowedOrigins)));
    if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
    }

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function php_backend_json_response($status, $payload)
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

function php_backend_error($status, $detail)
{
    php_backend_json_response($status, ['detail' => $detail]);
}

function php_backend_log($event, $context = [])
{
    $payload = [
        'ts' => gmdate('c'),
        'event' => $event,
        'context' => $context,
    ];
    error_log('[docdoc] ' . json_encode($payload));
}

function php_backend_require_method($method)
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        php_backend_error(405, 'Use ' . $method . ' for this endpoint.');
    }
}

function php_backend_get_api_key($config)
{
    $apiKey = getenv('OPENAI_API_KEY');
    if (!$apiKey && !empty($config['openai_api_key'])) {
        $apiKey = $config['openai_api_key'];
    }

    if (!$apiKey || $apiKey === 'PASTE_YOUR_OPENAI_API_KEY_HERE') {
        php_backend_error(500, 'OPENAI_API_KEY is not configured on the backend.');
    }

    return $apiKey;
}

function php_backend_parse_form_request()
{
    if (!isset($_POST['request'])) {
        php_backend_error(400, 'Missing form field `request`.');
    }

    $payload = json_decode($_POST['request'], true);
    if (!is_array($payload)) {
        php_backend_error(400, 'Invalid request payload JSON.');
    }

    return php_backend_validate_llm_request($payload);
}

function php_backend_parse_json_request()
{
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        php_backend_error(400, 'Invalid JSON request body.');
    }

    return php_backend_validate_llm_request($payload);
}

function php_backend_validate_llm_request($payload)
{
    if (empty($payload['systemPrompt']) || !is_string($payload['systemPrompt'])) {
        php_backend_error(400, 'Invalid request payload: `systemPrompt` is required.');
    }

    if (!isset($payload['messages']) || !is_array($payload['messages'])) {
        php_backend_error(400, 'Invalid request payload: `messages` must be an array.');
    }

    return [
        'apiMode' => !empty($payload['apiMode']) ? $payload['apiMode'] : 'responses',
        'model' => !empty($payload['model']) ? $payload['model'] : 'gpt-5-mini',
        'systemPrompt' => $payload['systemPrompt'],
        'messages' => $payload['messages'],
        'store' => isset($payload['store']) ? (bool) $payload['store'] : false,
        'deleteFileOnLlm' => isset($payload['deleteFileOnLlm']) ? (bool) $payload['deleteFileOnLlm'] : true,
    ];
}

function php_backend_curl_request($url, $headers, $payload = '', $method = 'POST')
{
    if (!function_exists('curl_init')) {
        php_backend_error(500, 'PHP cURL extension is not available on this hosting account.');
    }

    $ch = curl_init($url);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 180,
    ];

    if ($method === 'POST') {
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = $payload;
    } elseif ($method === 'DELETE') {
        $options[CURLOPT_CUSTOMREQUEST] = 'DELETE';
    } else {
        $options[CURLOPT_CUSTOMREQUEST] = $method;
        if ($payload !== '') {
            $options[CURLOPT_POSTFIELDS] = $payload;
        }
    }

    curl_setopt_array($ch, $options);

    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        php_backend_error(502, 'cURL request failed: ' . $error);
    }

    return [$status, $body];
}

function php_backend_upload_file_to_openai($apiKey, $upload)
{
    if (empty($upload) || empty($upload['tmp_name'])) {
        return null;
    }

    if (($upload['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        php_backend_error(400, 'File upload failed before reaching OpenAI for `' . ($upload['name'] ?? 'upload') . '`.');
    }

    $payload = [
        'purpose' => 'user_data',
        'file' => new CURLFile(
            $upload['tmp_name'],
            !empty($upload['type']) ? $upload['type'] : 'application/octet-stream',
            !empty($upload['name']) ? $upload['name'] : 'upload.bin'
        ),
    ];

    list($status, $body) = php_backend_curl_request(
        'https://api.openai.com/v1/files',
        ['Authorization: Bearer ' . $apiKey],
        $payload
    );

    $decoded = json_decode($body, true);
    if ($status < 200 || $status >= 300 || empty($decoded['id'])) {
        php_backend_error(502, 'OpenAI file upload failed.');
    }

    return $decoded['id'];
}

function php_backend_build_input_content($llmRequest, $fileMap, $apiKey)
{
    $builtMessages = [];

    foreach ($llmRequest['messages'] as $message) {
        $messageType = isset($message['type']) ? $message['type'] : null;
        if ($messageType === 'input_text') {
            $builtMessages[] = [
                'type' => 'input_text',
                'text' => isset($message['text']) ? $message['text'] : '',
            ];
            continue;
        }

        if ($messageType !== 'input_file') {
            php_backend_error(400, 'Unsupported message type: ' . $messageType);
        }

        $source = isset($message['source']) ? $message['source'] : null;
        if (!$source || !isset($fileMap[$source])) {
            php_backend_error(400, "Missing uploaded file for source '{$source}'.");
        }

        $fileId = php_backend_upload_file_to_openai($apiKey, $fileMap[$source]);
        if (!$fileId) {
            php_backend_error(400, "Missing uploaded file for source '{$source}'.");
        }

        $builtMessages[] = [
            'type' => 'input_file',
            'file_id' => $fileId,
        ];
    }

    return $builtMessages;
}

function php_backend_extract_output_text($decoded)
{
    if (!empty($decoded['choices']) && is_array($decoded['choices'])) {
        $firstChoice = $decoded['choices'][0] ?? [];
        $message = $firstChoice['message'] ?? [];
        $content = $message['content'] ?? '';
        if (is_string($content) && trim($content) !== '') {
            return $content;
        }
        if (is_array($content)) {
            $chunks = [];
            foreach ($content as $item) {
                if (($item['type'] ?? '') === 'text' && isset($item['text'])) {
                    $chunks[] = $item['text'];
                }
            }
            $joined = trim(implode("\n", $chunks));
            if ($joined !== '') {
                return $joined;
            }
        }
    }

    if (!empty($decoded['output_text'])) {
        return $decoded['output_text'];
    }

    $chunks = [];
    if (!empty($decoded['output']) && is_array($decoded['output'])) {
        foreach ($decoded['output'] as $outputItem) {
            if (empty($outputItem['content']) || !is_array($outputItem['content'])) {
                continue;
            }

            foreach ($outputItem['content'] as $contentItem) {
                if (($contentItem['type'] ?? '') === 'output_text' && isset($contentItem['text'])) {
                    $chunks[] = $contentItem['text'];
                }
            }
        }
    }

    $outputText = trim(implode("\n", $chunks));
    return $outputText !== '' ? $outputText : 'No output text returned.';
}

function php_backend_invoke_llm($llmRequest, $fileMap, $config)
{
    $apiKey = php_backend_get_api_key($config);
    $content = php_backend_build_input_content($llmRequest, $fileMap, $apiKey);
    php_backend_log('llm_invoke_start', [
        'apiMode' => $llmRequest['apiMode'] ?? 'responses',
        'deleteFileOnLlm' => !empty($llmRequest['deleteFileOnLlm']),
    ]);

    $apiMode = !empty($llmRequest['apiMode']) ? $llmRequest['apiMode'] : 'responses';
    if ($apiMode === 'chat') {
        $chatContent = [];
        foreach ($content as $item) {
            if (($item['type'] ?? '') === 'input_text') {
                $chatContent[] = [
                    'type' => 'text',
                    'text' => $item['text'] ?? '',
                ];
            } elseif (($item['type'] ?? '') === 'input_file') {
                $chatContent[] = [
                    'type' => 'file',
                    'file' => [
                        'file_id' => $item['file_id'] ?? '',
                    ],
                ];
            }
        }

        $requestBody = [
            'model' => $llmRequest['model'],
            'store' => !empty($llmRequest['store']),
            'messages' => [
                [
                    'role' => 'system',
                    'content' => $llmRequest['systemPrompt'],
                ],
                [
                    'role' => 'user',
                    'content' => $chatContent,
                ],
            ],
        ];
        $endpoint = 'https://api.openai.com/v1/chat/completions';
    } else {
        $requestBody = [
            'model' => $llmRequest['model'],
            'store' => !empty($llmRequest['store']),
            'input' => [
                [
                    'role' => 'system',
                    'content' => $llmRequest['systemPrompt'],
                ],
                [
                    'role' => 'user',
                    'content' => $content,
                ],
            ],
        ];
        $endpoint = 'https://api.openai.com/v1/responses';
    }

    list($status, $body) = php_backend_curl_request(
        $endpoint,
        [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ],
        json_encode($requestBody)
    );

    $decoded = json_decode($body, true);
    if ($status < 200 || $status >= 300 || !is_array($decoded)) {
        php_backend_error(502, 'Backend request failed.');
    }

    $deleteLogs = [
        'deleteRequested' => !empty($llmRequest['deleteFileOnLlm']),
        'scheduled' => false,
        'files' => [],
        'apiMode' => $apiMode,
    ];

    if (!empty($llmRequest['deleteFileOnLlm'])) {
        $deleteLogs['attempted'] = 0;
        $deleteLogs['succeeded'] = 0;
        $deleteLogs['failed'] = 0;
        foreach ($content as $item) {
            if (($item['type'] ?? '') === 'input_file' && !empty($item['file_id'])) {
                $deleteLogs['attempted'] += 1;
                list($deleteStatus, $deleteBody) = php_backend_curl_request(
                    'https://api.openai.com/v1/files/' . rawurlencode($item['file_id']),
                    [
                        'Authorization: Bearer ' . $apiKey,
                    ],
                    '',
                    'DELETE'
                );
                $deleteDecoded = json_decode($deleteBody, true);
                $deleteSuccess = $deleteStatus >= 200 && $deleteStatus < 300 && !empty($deleteDecoded['deleted']);
                if ($deleteSuccess) {
                    $deleteLogs['succeeded'] += 1;
                } else {
                    $deleteLogs['failed'] += 1;
                }
                $deleteLogs['files'][] = [
                    'fileId' => $item['file_id'],
                    'status' => $deleteStatus,
                    'success' => $deleteSuccess,
                    'response' => $deleteBody,
                ];
                php_backend_log('openai_file_delete', [
                    'fileId' => $item['file_id'],
                    'status' => $deleteStatus,
                    'success' => $deleteSuccess,
                    'response' => $deleteBody,
                ]);
            }
        }
        if (empty($deleteLogs['files'])) {
            $deleteLogs['note'] = 'No input_file entries were present to delete.';
        }
    } else {
        $deleteLogs['note'] = 'Deletion disabled by request.';
    }

    return [
        'outputText' => php_backend_extract_output_text($decoded),
        'deleteLogs' => $deleteLogs,
    ];
}
