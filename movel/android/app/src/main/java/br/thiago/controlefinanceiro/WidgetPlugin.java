package br.thiago.controlefinanceiro;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A ponte entre a tela do app e o widget.
 *
 * O app guarda os dados no localStorage do WebView, e o widget não
 * tem como ler aquilo. Então a tela chama este plugin a cada
 * mudança, ele copia o essencial para o SharedPreferences — que é
 * onde o widget consegue ler — e manda redesenhar na hora.
 *
 * Sem o redesenho imediato o widget só acordaria na próxima ronda do
 * sistema, e a pessoa veria o número antigo por até meia hora depois
 * de abrir o app.
 */
@CapacitorPlugin(name = "ControleWidget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void atualizar(PluginCall chamada) {
        Context ctx = getContext();
        SharedPreferences p = ctx.getSharedPreferences(PlantaWidget.PREFS, Context.MODE_PRIVATE);

        p.edit()
                .putInt("sequencia", chamada.getInt("sequencia", 0))
                .putInt("escudos", chamada.getInt("escudos", 0))
                .putString("estagio", chamada.getString("estagio", "🌱"))
                .putString("estagioNome", chamada.getString("estagioNome", ""))
                .putString("estagioChave", chamada.getString("estagioChave", "semente"))
                .putString("ultimoDia", chamada.getString("ultimoDia", ""))
                .apply();

        PlantaWidget.atualizarTodos(ctx);
        chamada.resolve();
    }
}
