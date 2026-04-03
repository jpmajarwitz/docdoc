<?php

require_once __DIR__ . '/bootstrap.php';

function auth_start_session($config)
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $secureCookie = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (!empty($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443);
    session_name('docdoc_auth');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secureCookie,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function auth_read_json_body()
{
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        php_backend_error(400, 'Invalid JSON request body.');
    }

    return $payload;
}

function auth_get_db_config($config)
{
    $servername = trim((string) ($config['db_servername'] ?? getenv('DB_SERVERNAME') ?: ''));
    $username = trim((string) ($config['db_username'] ?? getenv('DB_USERNAME') ?: ''));
    $password = (string) ($config['db_password'] ?? getenv('DB_PASSWORD') ?: '');
    $dbname = trim((string) ($config['db_name'] ?? getenv('DB_NAME') ?: ''));
    $port = (int) ($config['db_port'] ?? getenv('DB_PORT') ?: 3306);

    if ($servername === '' || $username === '' || $dbname === '') {
        php_backend_error(500, 'Database configuration is missing. Set db_servername, db_username, db_password, and db_name in config.php.');
    }

    return [
        'servername' => $servername,
        'username' => $username,
        'password' => $password,
        'dbname' => $dbname,
        'port' => $port,
    ];
}

function auth_get_pdo($config)
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $db = auth_get_db_config($config);
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $db['servername'], $db['port'], $db['dbname']);

    try {
        $pdo = new PDO($dsn, $db['username'], $db['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $e) {
        php_backend_error(500, 'Failed to connect to auth database: ' . $e->getMessage());
    }

    return $pdo;
}

function auth_normalize_email($email)
{
    return strtolower(trim((string) $email));
}

function auth_validate_password($password)
{
    if (!is_string($password) || strlen($password) < 8) {
        php_backend_error(400, 'Password must be at least 8 characters.');
    }
}

function auth_generate_token()
{
    return bin2hex(random_bytes(32));
}

function auth_token_hash($token)
{
    return hash('sha256', (string) $token);
}

function auth_get_user_by_email(PDO $pdo, $emailNormalized)
{
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email_normalized = :email LIMIT 1');
    $stmt->execute(['email' => $emailNormalized]);
    return $stmt->fetch() ?: null;
}

function auth_get_user_by_id(PDO $pdo, $userId)
{
    $stmt = $pdo->prepare('SELECT id, email, display_name, status FROM users WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $userId]);
    return $stmt->fetch() ?: null;
}

function auth_public_user($user)
{
    return [
        'id' => isset($user['id']) ? (int) $user['id'] : null,
        'email' => $user['email'] ?? '',
        'displayName' => $user['display_name'] ?? '',
        'status' => $user['status'] ?? '',
    ];
}
