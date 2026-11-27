<?php
$x = $_POST['x'];
if ( {
mysql_query("UPDATE contas SET saldo = 0 WHERE id = '$x'");
header("Location: ok.php");
