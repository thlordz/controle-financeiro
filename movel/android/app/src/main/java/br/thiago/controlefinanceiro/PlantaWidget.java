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
        String estagio = p.getString("estagio", "🌱");
        String ultimoDia = p.getString("ultimoDia", "");
        boolean entrouHoje = hojeISO().equals(ultimoDia);

        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_planta);
        v.setTextViewText(R.id.widget_emoji, estagio);
        v.setTextViewText(R.id.widget_numero, String.valueOf(sequencia));
        v.setTextViewText(R.id.widget_rotulo, sequencia == 1 ? "dia seguido" : "dias seguidos");

        StringBuilder selos = new StringBuilder();
        for (int i = 0; i < escudos; i++) selos.append("🛡️");
        v.setTextViewText(R.id.widget_escudos, selos.toString());
        v.setViewVisibility(R.id.widget_escudos, escudos > 0 ? View.VISIBLE : View.GONE);

        v.setViewVisibility(R.id.widget_aviso, entrouHoje ? View.GONE : View.VISIBLE);

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
}
