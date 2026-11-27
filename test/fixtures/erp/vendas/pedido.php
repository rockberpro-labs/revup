<html>
<body>
<?php
include "../inc/db.php";
require_once dirname(__FILE__) . '/../inc/util.php';
if ($_GET['extra']) include "extra.php";
include $modulo . ".php";

session_start();
$id = $_GET['id'];
$sql = "SELECT p.*, c.nome FROM pedidos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id=" . $id;
$rs = mysql_query($sql);
mysql_query("INSERT INTO itens (pedido, qtd) VALUES ('$id', '{$_POST['qtd']}')");
$tabela = "log_" . date("Y");
mysql_query("DELETE FROM " . $tabela . " WHERE pedido = $id");
$_SESSION['ultimo_pedido'] = $id;
$user = $_SESSION['user'];
foreach ($_POST as $k => $v) { }
?>
<h1><?= $_SESSION['user'] ?></h1>
<? echo "Total: " . $total; ?>
<?php
function total_pedido($p) { return 1; }
header("Location: lista.php?ok=" . $id);
