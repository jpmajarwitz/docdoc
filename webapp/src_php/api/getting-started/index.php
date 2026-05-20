<?php
require_once dirname(__DIR__, 2) . '/lib/auth.php';
$config = php_backend_load_config();
php_backend_apply_cors($config);
$path = dirname(__DIR__, 2) . '/data/getting_started.json';
if (!file_exists($path)) {
  file_put_contents($path, json_encode([], JSON_PRETTY_PRINT));
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'GET' && $method !== 'POST') {
  php_backend_error(405, 'Method Not Allowed');
}

$user = auth_require_active_session($config);
if ($method === 'GET') {
  $raw = file_get_contents($path);
  $items = json_decode($raw ?: '[]', true);
  if (!is_array($items)) $items = [];
  php_backend_json_response(200, ['ok' => true, 'items' => $items]);
}

php_backend_require_method('POST');
if (strtolower((string) ($user['user_type'] ?? 'regular')) !== 'registration_admin') php_backend_error(403, 'Registration admin access is required.');
$payload = auth_read_json_body();
$items = $payload['items'] ?? [];
if (!is_array($items)) php_backend_error(400, 'items must be an array');
$normalized = [];
foreach ($items as $item) {
  $s = trim((string)($item['subsection'] ?? ''));
  $q = trim((string)($item['question'] ?? ''));
  $a = trim((string)($item['answer'] ?? ''));
  if ($q !== '') $normalized[] = ['subsection' => $s, 'question' => $q, 'answer' => $a];
}
file_put_contents($path, json_encode($normalized, JSON_PRETTY_PRINT));
php_backend_json_response(200, ['ok' => true, 'items' => $normalized, 'message' => 'Getting Started content saved.']);
