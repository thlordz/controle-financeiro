package br.thiago.controlefinanceiro;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Atualização do app pelo GitHub.
 *
 * A parte pensante — qual é a versão nova, o que precisa baixar — fica
 * do lado do JavaScript. Aqui embaixo ficam só as duas coisas que o
 * navegador não consegue fazer: baixar de um repositório privado sem
 * tropeçar no desvio, e abrir o instalador do Android.
 *
 * O desvio merece explicação. O GitHub responde o pedido de um anexo
 * com um "vá buscar naquele outro servidor". Esse outro servidor
 * recusa o pedido se o cabeçalho de autorização for junto — ele tem o
 * seu próprio jeito de autorizar, embutido no endereço. Por isso o
 * segundo salto vai sem token. As bibliotecas comuns seguem o desvio
 * sozinhas, repetindo o cabeçalho, e por isso não servem aqui.
 */
@CapacitorPlugin(name = "ControleAtualizacao")
public class AtualizacaoPlugin extends Plugin {

    private static final String PREFS = "atualizacao";
    private static final String ARQUIVO_APK = "atualizacao.apk";

    // ------------------------------------------------------------------
    // Rede
    // ------------------------------------------------------------------

    private HttpURLConnection conectar(String endereco, String token, String aceitar)
            throws IOException {
        String proximo = endereco;
        String autorizacao = token;

        for (int salto = 0; salto < 5; salto++) {
            HttpURLConnection conexao = (HttpURLConnection) new URL(proximo).openConnection();
            conexao.setInstanceFollowRedirects(false);
            conexao.setConnectTimeout(30000);
            conexao.setReadTimeout(120000);
            conexao.setRequestProperty("Accept", aceitar);
            conexao.setRequestProperty("User-Agent", "Controle-Financeiro");
            if (autorizacao != null) {
                conexao.setRequestProperty("Authorization", "Bearer " + autorizacao);
            }

            int codigo = conexao.getResponseCode();
            if (codigo >= 300 && codigo < 400) {
                String destino = conexao.getHeaderField("Location");
                conexao.disconnect();
                if (destino == null) throw new IOException("desvio sem destino");
                proximo = destino;
                autorizacao = null;
                continue;
            }
            if (codigo != 200) {
                conexao.disconnect();
                throw new IOException("GitHub respondeu " + codigo);
            }
            return conexao;
        }
        throw new IOException("desvios demais");
    }

    @PluginMethod
    public void baixarTexto(PluginCall chamada) {
        final String url = chamada.getString("url");
        final String token = chamada.getString("token");
        if (url == null) { chamada.reject("falta o endereço"); return; }

        new Thread(() -> {
            HttpURLConnection conexao = null;
            try {
                conexao = conectar(url, token, "application/octet-stream");
                ByteArrayOutputStream saida = new ByteArrayOutputStream();
                copiar(conexao.getInputStream(), saida);
                JSObject r = new JSObject();
                r.put("texto", saida.toString("UTF-8"));
                chamada.resolve(r);
            } catch (Exception e) {
                chamada.reject(e.getMessage() == null ? "falhou" : e.getMessage());
            } finally {
                if (conexao != null) conexao.disconnect();
            }
        }).start();
    }

    /**
     * Baixa o APK novo e guarda onde ele ficou. Só dá por boa a versão
     * cuja soma de verificação bate com a que o manifesto prometeu —
     * um download cortado no meio não pode virar uma instalação.
     */
    @PluginMethod
    public void baixarApk(PluginCall chamada) {
        final String url = chamada.getString("url");
        final String token = chamada.getString("token");
        final String somaEsperada = chamada.getString("soma");
        final String versao = chamada.getString("versao");
        if (url == null || versao == null) { chamada.reject("falta endereço ou versão"); return; }

        new Thread(() -> {
            HttpURLConnection conexao = null;
            File destino = new File(getContext().getCacheDir(), ARQUIVO_APK);
            try {
                conexao = conectar(url, token, "application/octet-stream");
                FileOutputStream saida = new FileOutputStream(destino);
                copiar(conexao.getInputStream(), saida);
                saida.close();

                String soma = somaDoArquivo(destino);
                if (somaEsperada != null && !somaEsperada.equalsIgnoreCase(soma)) {
                    destino.delete();
                    chamada.reject("o arquivo chegou diferente do esperado");
                    return;
                }

                prefs().edit()
                        .putString("versao", versao)
                        .putString("caminho", destino.getAbsolutePath())
                        .apply();

                JSObject r = new JSObject();
                r.put("versao", versao);
                chamada.resolve(r);
            } catch (Exception e) {
                destino.delete();
                chamada.reject(e.getMessage() == null ? "falhou" : e.getMessage());
            } finally {
                if (conexao != null) conexao.disconnect();
            }
        }).start();
    }

    // ------------------------------------------------------------------
    // Instalação
    // ------------------------------------------------------------------

    @PluginMethod
    public void pendente(PluginCall chamada) {
        JSObject r = new JSObject();
        String versao = prefs().getString("versao", null);
        String caminho = prefs().getString("caminho", null);
        if (versao != null && caminho != null && new File(caminho).exists()) {
            r.put("versao", versao);
        }
        chamada.resolve(r);
    }

    /**
     * Abre o instalador do Android.
     *
     * O sistema sempre pergunta — não existe jeito de instalar calado
     * fora da loja, e é bom que seja assim. Na primeira vez ele ainda
     * manda a pessoa ligar a permissão numa tela de ajustes; quando
     * for o caso, levamos direto para lá.
     */
    @PluginMethod
    public void instalar(PluginCall chamada) {
        String caminho = prefs().getString("caminho", null);
        if (caminho == null || !new File(caminho).exists()) {
            chamada.reject("não há atualização baixada");
            return;
        }

        Context contexto = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !contexto.getPackageManager().canRequestPackageInstalls()) {
            Intent permissao = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + contexto.getPackageName()));
            permissao.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            contexto.startActivity(permissao);
            JSObject r = new JSObject();
            r.put("precisaPermissao", true);
            chamada.resolve(r);
            return;
        }

        Uri endereco = FileProvider.getUriForFile(
                contexto, contexto.getPackageName() + ".fileprovider", new File(caminho));

        Intent instalar = new Intent(Intent.ACTION_VIEW);
        instalar.setDataAndType(endereco, "application/vnd.android.package-archive");
        instalar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        instalar.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        contexto.startActivity(instalar);

        chamada.resolve(new JSObject());
    }

    /** Esquece a atualização baixada — usado quando ela já foi instalada. */
    @PluginMethod
    public void esquecer(PluginCall chamada) {
        String caminho = prefs().getString("caminho", null);
        if (caminho != null) new File(caminho).delete();
        prefs().edit().clear().apply();
        chamada.resolve(new JSObject());
    }

    // ------------------------------------------------------------------
    // Miudezas
    // ------------------------------------------------------------------

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void copiar(InputStream entrada, java.io.OutputStream saida) throws IOException {
        byte[] balde = new byte[8192];
        int lidos;
        while ((lidos = entrada.read(balde)) != -1) saida.write(balde, 0, lidos);
        entrada.close();
    }

    private String somaDoArquivo(File arquivo) throws Exception {
        MessageDigest resumo = MessageDigest.getInstance("SHA-256");
        try (java.io.FileInputStream entrada = new java.io.FileInputStream(arquivo)) {
            byte[] balde = new byte[8192];
            int lidos;
            while ((lidos = entrada.read(balde)) != -1) resumo.update(balde, 0, lidos);
        }
        StringBuilder texto = new StringBuilder();
        for (byte b : resumo.digest()) texto.append(String.format("%02x", b));
        return texto.toString();
    }
}
