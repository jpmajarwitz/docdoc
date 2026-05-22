<?php
require_once dirname(__DIR__) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);

if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
  php_backend_error(403, 'HTTPS is required.');
}

$allowedHosts = array_values(array_filter([
  strtolower((string) ($config['app_host'] ?? '')),
  'enddne.com',
  'www.enddne.com'
]));
if ($allowedHosts) {
  $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
  if (!in_array($host, $allowedHosts, true)) {
    php_backend_error(403, 'Host is not allowed.');
  }
}

$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$allowedOrigins = array_values(array_filter([
  (string) ($config['app_origin'] ?? ''),
  'https://enddne.com',
  'https://www.enddne.com'
]));
if ($origin !== '' && $allowedOrigins && !in_array($origin, $allowedOrigins, true)) {
  php_backend_error(403, 'Origin is not allowed.');
}

session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'secure' => true,
  'httponly' => true,
  'samesite' => 'Lax'
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

$scriptName = (string) ($_SERVER['SCRIPT_NAME'] ?? '/api/index.php');
$uriPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?: '/';
$basePath = rtrim(str_replace('/index.php', '', $scriptName), '/');
$routePath = '/' . ltrim(substr($uriPath, strlen($basePath)), '/');
$routePath = preg_replace('#/+#', '/', $routePath);
$routePath = rtrim($routePath, '/');
if ($routePath === '') $routePath = '/';

$publicRoutes = [
  '/health',
  '/auth/session',
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/access-check',
  '/auth/contact-request',
  '/getting-started'
];
$isPublicRoute = in_array($routePath, $publicRoutes, true);
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'OPTIONS') {
  php_backend_json_response(200, ['ok' => true]);
}

if (!$isPublicRoute) {
  auth_require_active_session($config);
}

$stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
if (in_array($method, $stateChangingMethods, true) && !$isPublicRoute) {
  $csrfSessionToken = (string) ($_SESSION['csrf_token'] ?? '');
  $csrfHeaderToken = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
  if ($csrfSessionToken === '' || $csrfHeaderToken === '' || !hash_equals($csrfSessionToken, $csrfHeaderToken)) {
    php_backend_error(403, 'CSRF validation failed.');
  }
}

$routeFile = __DIR__ . $routePath . '/index.php';
if (!preg_match('#^' . preg_quote(__DIR__, '#') . '#', $routeFile)) {
  php_backend_error(400, 'Invalid route path.');
}
if (!is_file($routeFile)) {
  php_backend_error(404, 'Route not found.');
}
if (realpath($routeFile) === realpath(__FILE__)) {
  php_backend_error(404, 'Route not found.');
}

require $routeFile;
