//go:build webkit
// +build webkit

package main

/*
#cgo pkg-config: webkit2gtk-4.1 gtk+-3.0
#cgo CFLAGS: -Wall -Wextra
#cgo LDFLAGS: -lwebkit2gtk-4.1 -lgtk-3 -lgobject-2.0 -lglib-2.0

#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <JavaScriptCore/JavaScriptCore.h>
#include <stdlib.h>
#include <string.h>

extern void go_HandleJSMessage(const char* message);
extern const char* go_GetHTML();

static WebKitUserContentManager* user_content_manager = NULL;
static WebKitWebView* web_view = NULL;
static GtkWidget* window = NULL;

void init_webkit(int width, int height, const char* title) {
    gtk_init(NULL, NULL);

    window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(window), title);
    gtk_window_set_default_size(GTK_WINDOW(window), width, height);
    gtk_window_set_position(GTK_WINDOW(window), GTK_WIN_POS_CENTER);
    gtk_window_set_resizable(GTK_WINDOW(window), TRUE);

    g_signal_connect(window, "destroy", G_CALLBACK(gtk_main_quit), NULL);

    user_content_manager = webkit_user_content_manager_new();

    // Inject our JS bridge
    const char* bridge_js = 
        "window.launcherHost = {"
        "  login: function(user, pass) { return window.webkit.messageHandlers.launcherHost.postMessage(JSON.stringify({method:'login', params:[user,pass]})); }"
        "};";
    webkit_user_content_manager_add_script(user_content_manager,
        webkit_user_script_new(bridge_js, WEBKIT_USER_CONTENT_INJECT_TOP_FRAME, WEBKIT_USER_SCRIPT_INJECT_AT_DOCUMENT_START, NULL, NULL));

    WebKitWebContext* context = webkit_web_context_get_default();
    webkit_web_context_set_cache_model(context, WEBKIT_CACHE_MODEL_WEB_BROWSER);

    web_view = WEBKIT_WEB_VIEW(webkit_web_view_new_with_user_content_manager(user_content_manager));
    gtk_container_add(GTK_CONTAINER(window), GTK_WIDGET(web_view));

    // Handle messages from JS
    g_signal_connect(user_content_manager, "script-message-received::launcherHost", G_CALLBACK(on_js_message), NULL);

    // Load HTML
    const char* html = go_GetHTML();
    webkit_web_view_load_html(web_view, html, "http://localhost:3000");

    gtk_widget_show_all(window);
    gtk_main();
}

void on_js_message(WebKitUserContentManager* manager, WebKitJavascriptResult* result, gpointer user_data) {
    JSCValue* value = webkit_javascript_result_get_js_value(result);
    const char* json = jsc_value_to_json(value, NULL);
    if (json) {
        go_HandleJSMessage(json);
        free((void*)json);
    }
}

void webkit_load_uri(const char* uri) {
    if (web_view) {
        webkit_web_view_load_uri(web_view, uri);
    }
}

void webkit_execute_js(const char* js) {
    if (web_view) {
        webkit_web_view_evaluate_javascript(web_view, js, -1, NULL, NULL, NULL);
    }
}

void webkit_set_title(const char* title) {
    if (window) {
        gtk_window_set_title(GTK_WINDOW(window), title);
    }
}

void webkit_quit() {
    gtk_main_quit();
}
*/
import "C"
import (
	"encoding/json"
	"fmt"
	"runtime"
	"unsafe"
)

//export go_HandleJSMessage
func go_HandleJSMessage(message *C.char) {
	msg := C.GoString(message)
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(msg), &data); err != nil {
		return
	}

	method, _ := data["method"].(string)
	params, _ := data["params"].([]interface{})

	switch method {
	case "login":
		if len(params) >= 2 {
			user, _ := params[0].(string)
			pass, _ := params[1].(string)
			go appInstance.Login(user, pass)
		}
	case "activateKey":
		if len(params) >= 1 {
			key, _ := params[0].(string)
			go appInstance.ActivateKey(key)
		}
	case "getStatus":
		go appInstance.GetStatus()
	case "checkVersion":
		go appInstance.CheckVersion()
	case "logLaunch":
		if len(params) >= 2 {
			action, _ := params[0].(string)
			details, _ := params[1].(string)
			go appInstance.LogLaunch(action, details)
		}
	case "launchClient":
		go appInstance.LaunchClient()
	case "openURL":
		if len(params) >= 1 {
			url, _ := params[0].(string)
			go appInstance.OpenURL(url)
		}
	case "minimize":
		go appInstance.MinimizeWindow()
	case "close":
		go appInstance.CloseWindow()
	}
}

//export go_GetHTML
func go_GetHTML() *C.char {
	html, err := readHTMLFile()
	if err != nil {
		return C.CString("<html><body>Error loading launcher</body></html>")
	}
	return C.CString(html)
}

func readHTMLFile() (string, error) {
	// Read from embedded assets or file
	// For development, read from file
	data, err := os.ReadFile("frontend/launcher.html")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func runWebKitGTK(app *App) error {
	runtime.LockOSThread()
	appInstance = app

	cTitle := C.CString("Soda Launcher")
	defer C.free(unsafe.Pointer(cTitle))

	C.init_webkit(520, 720, cTitle)
	return nil
}

var appInstance *App