package br.thiago.controlefinanceiro;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * O widget da planta na tela inicial.
 *
 * Ele não conhece o app por dentro: lê o que o WidgetPlugin deixou
 * guardado (sequência, escudos, estágio e o dia do último acesso) e
 * desenha. Essa separação é o que permite ele aparecer certo mesmo
 * com o app fechado há dias.
 *
 * "Entrou hoje" é decidido AQUI, comparando a data guardada com a de
 * agora — e não gravado como sim/não. Gravado, ficaria eternamente
 * "sim" depois da última abertura, e o widget nunca cobraria nada.
 */
public class PlantaWidget extends AppWidgetProvider {

    public static final String PREFS = "controle_financeiro_widget";

    static String hojeISO() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static void desenhar(Context ctx, AppWidgetManager gerente, int id) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int sequencia = p.getInt("sequencia", 0);
        int escudos = p.getInt("escudos", 0);

        String ultimoDia = p.getString("ultimoDia", "");
        boolean entrouHoje = hojeISO().equals(ultimoDia);

        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_planta);
        v.setImageViewResource(R.id.widget_planta, desenhoDaPlanta(p.getString("estagioChave", "semente")));
        v.setTextViewText(R.id.widget_numero, String.valueOf(sequencia));
        v.setTextViewText(R.id.widget_rotulo, sequencia == 1 ? "dia seguido" : "dias seguidos");

        StringBuilder selos = new StringBuilder();
        for (int i = 0; i < escudos; i++) selos.append("🛡️");
        v.setTextViewText(R.id.widget_escudos, selos.toString());
        v.setViewVisibility(R.id.widget_escudos, escudos > 0 ? View.VISIBLE : View.GONE);

        v.setViewVisibility(R.id.widget_aviso, entrouHoje ? View.GONE : View.VISIBLE);

        // O nome do estágio, na mesma etiqueta que o app mostra. Ele
        // vem escrito do lado do JavaScript; aqui só aparece.
        String nome = p.getString("estagioNome", "");
        v.setTextViewText(R.id.widget_estagio, nome);
        v.setViewVisibility(R.id.widget_estagio, nome.isEmpty() ? View.GONE : View.VISIBLE);

        // Tocar no widget abre o app.
        Intent abrir = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (abrir != null) {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            v.setOnClickPendingIntent(R.id.widget_raiz,
                    PendingIntent.getActivity(ctx, 0, abrir, flags));
        }

        gerente.updateAppWidget(id, v);
    }

    /** Redesenha todos os widgets colocados na tela. */
    public static void atualizarTodos(Context ctx) {
        AppWidgetManager gerente = AppWidgetManager.getInstance(ctx);
        int[] ids = gerente.getAppWidgetIds(new ComponentName(ctx, PlantaWidget.class));
        for (int id : ids) desenhar(ctx, gerente, id);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager gerente, int[] ids) {
        for (int id : ids) desenhar(ctx, gerente, id);
    }

    /**
     * A chave do estágio vira o desenho correspondente.
     *
     * São os mesmos desenhos que o app mostra, rasterizados na hora de
     * gerar o pacote. Um `switch` explícito em vez de procurar o nome
     * do recurso por reflexão: assim o compilador reclama se algum
     * desenho sumir, em vez de o widget aparecer vazio no aparelho.
     */
    private static int desenhoDaPlanta(String chave) {
        if (chave == null) return R.drawable.planta_semente;
        switch (chave) {
            case "brotando":    return R.drawable.planta_brotando;
            case "crescendo":   return R.drawable.planta_crescendo;
            case "florescendo": return R.drawable.planta_florescendo;
            case "murchando":   return R.drawable.planta_murchando;
            case "seca":        return R.drawable.planta_seca;
            case "abandonada":  return R.drawable.planta_abandonada;
            case "morta":       return R.drawable.planta_morta;
            default:            return R.drawable.planta_semente;
        }
    }
}
