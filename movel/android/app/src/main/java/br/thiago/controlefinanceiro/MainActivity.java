package br.thiago.controlefinanceiro;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle estadoSalvo) {
        // Registrar antes do super: é quando a ponte monta a lista de
        // plugins disponíveis para a tela.
        registerPlugin(WidgetPlugin.class);
        registerPlugin(AtualizacaoPlugin.class);
        super.onCreate(estadoSalvo);
    }
}
