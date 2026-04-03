<?php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function json_response(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

function load_config(): array
{
    $config = [];
    $configPath = __DIR__ . '/config.php';
    if (file_exists($configPath)) {
        $loaded = require $configPath;
        if (is_array($loaded)) {
            $config = $loaded;
        }
    }

    return $config;
}

function get_openai_api_key(array $config): string
{
    $apiKey = getenv('OPENAI_API_KEY') ?: ($config['openai_api_key'] ?? '');
    if (!$apiKey || $apiKey === 'PASTE_YOUR_OPENAI_API_KEY_HERE') {
        json_response(500, [
            'ok' => false,
            'error' => 'OPENAI_API_KEY is not configured. Set it in config.php or as an environment variable.',
        ]);
    }

    return $apiKey;
}

function curl_json_request(string $url, array $headers, $payload): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_TIMEOUT => 120,
    ]);

    $body = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        json_response(500, [
            'ok' => false,
            'error' => 'cURL request failed.',
            'details' => $error,
        ]);
    }

    return [$httpCode, $body];
}

function upload_file_to_openai(string $apiKey, array $file): ?string
{
    if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
        return null;
    }

    $payload = [
        'purpose' => 'user_data',
        'file' => new CURLFile(
            $file['tmp_name'],
            $file['type'] ?: 'application/octet-stream',
            $file['name'] ?: 'upload.bin'
        ),
    ];

    [$httpCode, $body] = curl_json_request(
        'https://api.openai.com/v1/files',
        [
            'Authorization: Bearer ' . $apiKey,
        ],
        $payload
    );

    $decoded = json_decode($body, true);
    if ($httpCode < 200 || $httpCode >= 300 || !isset($decoded['id'])) {
        json_response(502, [
            'ok' => false,
            'error' => 'OpenAI file upload failed.',
            'status' => $httpCode,
            'response' => $decoded ?: $body,
        ]);
    }

    return $decoded['id'];
}

function run_database_connection_test(): void
{
    if (!function_exists('mysqli_init')) {
        json_response(500, [
            'ok' => false,
            'error' => 'PHP mysqli extension is not available on this hosting account.',
        ]);
    }

    $servername = trim($_POST['db_servername'] ?? '');
    $username = trim($_POST['db_username'] ?? '');
    $password = (string) ($_POST['db_password'] ?? '');
    $dbname = trim($_POST['db_name'] ?? '');

    if ($servername === '' || $username === '' || $dbname === '') {
        json_response(400, [
            'ok' => false,
            'error' => 'db_servername, db_username, and db_name are required.',
        ]);
    }

    mysqli_report(MYSQLI_REPORT_OFF);
    $mysqli = mysqli_init();
    if (!$mysqli) {
        json_response(500, [
            'ok' => false,
            'error' => 'Failed to initialize mysqli client.',
        ]);
    }

    $connected = @mysqli_real_connect($mysqli, $servername, $username, $password, $dbname);
    if (!$connected) {
        $errno = mysqli_connect_errno();
        $error = mysqli_connect_error();
        if ($mysqli instanceof mysqli) {
            $mysqli->close();
        }

        json_response(502, [
            'ok' => false,
            'test_type' => 'db_connection',
            'connected' => false,
            'error' => 'Database connection failed.',
            'details' => $error,
            'mysql_errno' => $errno,
            'server' => $servername,
            'db_name' => $dbname,
            'username' => $username,
        ]);
    }

    $hostInfo = mysqli_get_host_info($mysqli);
    $serverInfo = mysqli_get_server_info($mysqli);
    $threadId = mysqli_thread_id($mysqli);
    mysqli_close($mysqli);

    json_response(200, [
        'ok' => true,
        'test_type' => 'db_connection',
        'connected' => true,
        'message' => 'Database connection succeeded and was closed cleanly.',
        'server' => $servername,
        'db_name' => $dbname,
        'username' => $username,
        'host_info' => $hostInfo,
        'server_info' => $serverInfo,
        'thread_id' => $threadId,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, [
        'ok' => false,
        'error' => 'Use POST to call this endpoint.',
    ]);
}

$testType = trim($_POST['test_type'] ?? 'openai');
if ($testType === 'db_connection') {
    run_database_connection_test();
}

if (!function_exists('curl_init')) {
    json_response(500, [
        'ok' => false,
        'error' => 'PHP cURL extension is not available on this hosting account.',
    ]);
}

$config = load_config();
$apiKey = get_openai_api_key($config);
$apiMode = trim($_POST['api_mode'] ?? 'responses');
$model = trim($_POST['model'] ?? ($config['default_model'] ?? 'gpt-5-mini'));
$prompt = trim($_POST['prompt'] ?? '');

if ($prompt === '') {
    json_response(400, [
        'ok' => false,
        'error' => 'Prompt is required.',
    ]);
}

$fileId = null;
if (!empty($_FILES['document']) && ($_FILES['document']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
    if ($_FILES['document']['error'] !== UPLOAD_ERR_OK) {
        json_response(400, [
            'ok' => false,
            'error' => 'File upload failed before reaching OpenAI.',
            'php_upload_error' => $_FILES['document']['error'],
        ]);
    }

    $fileId = upload_file_to_openai($apiKey, $_FILES['document']);
}

$content = [
    [
        'type' => 'input_text',
        'text' => $prompt,
    ],
];

if ($fileId) {
    $content[] = [
        'type' => 'input_file',
        'file_id' => $fileId,
    ];
}

$endpoint = 'https://api.openai.com/v1/responses';
if ($apiMode === 'chat') {
    $chatContent = [
        [
            'type' => 'text',
            'text' => $prompt,
        ],
    ];
    if ($fileId) {
        $chatContent[] = [
            'type' => 'file',
            'file' => [
                'file_id' => $fileId,
            ],
        ];
    }

    $requestBody = [
        'model' => $model,
        'store' => false,
        'messages' => [
            [
                'role' => 'user',
                'content' => $chatContent,
            ],
        ],
    ];
    $endpoint = 'https://api.openai.com/v1/chat/completions';
} else {
    $requestBody = [
        'model' => $model,
        'store' => false,
        'input' => [
            [
                'role' => 'user',
                'content' => $content,
            ],
        ],
    ];
}

[$httpCode, $body] = curl_json_request(
    $endpoint,
    [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json',
    ],
    json_encode($requestBody)
);

$decoded = json_decode($body, true);
if ($httpCode < 200 || $httpCode >= 300) {
    json_response(502, [
        'ok' => false,
        'error' => 'OpenAI response call failed.',
        'status' => $httpCode,
        'response' => $decoded ?: $body,
    ]);
}

$outputText = $decoded['output_text'] ?? null;
if (!$outputText && !empty($decoded['choices']) && is_array($decoded['choices'])) {
    $choice = $decoded['choices'][0] ?? [];
    $message = $choice['message'] ?? [];
    if (isset($message['content']) && is_string($message['content'])) {
        $outputText = $message['content'];
    } elseif (isset($message['content']) && is_array($message['content'])) {
        $chunks = [];
        foreach ($message['content'] as $contentItem) {
            if (($contentItem['type'] ?? '') === 'text' && isset($contentItem['text'])) {
                $chunks[] = $contentItem['text'];
            }
        }
        $outputText = trim(implode("\n", $chunks));
    }
}

if (!$outputText && !empty($decoded['output']) && is_array($decoded['output'])) {
    $chunks = [];
    foreach ($decoded['output'] as $item) {
        foreach (($item['content'] ?? []) as $contentItem) {
            if (($contentItem['type'] ?? '') === 'output_text' && isset($contentItem['text'])) {
                $chunks[] = $contentItem['text'];
            }
        }
    }
    $outputText = trim(implode("\n", $chunks));
}

json_response(200, [
    'ok' => true,
    'test_type' => 'openai',
    'model' => $model,
    'uploaded_file_id' => $fileId,
    'output_text' => $outputText,
    'raw_response' => $decoded,
]);
