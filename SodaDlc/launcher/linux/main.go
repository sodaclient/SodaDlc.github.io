package main

/*
#cgo pkg-config: webkit2gtk-4.1 gtk+-3.0

#include <gtk/gtk.h>
#include <webkit2/webkit2.h>

static void soda_on_destroy(GtkWidget *widget, gpointer data) {
    (void)widget;
    (void)data;
    gtk_main_quit();
}

static void soda_run(const char *url, const char *icon_path, const char *title, int width, int height) {
    gtk_init(NULL, NULL);

    GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(window), title);
    gtk_window_set_default_size(GTK_WINDOW(window), width, height);
    gtk_window_set_position(GTK_WINDOW(window), GTK_WIN_POS_CENTER);
    gtk_window_set_resizable(GTK_WINDOW(window), TRUE);
    if (icon_path != NULL && icon_path[0] != '\0') {
        gtk_window_set_icon_from_file(GTK_WINDOW(window), icon_path, NULL);
    }
    g_signal_connect(window, "destroy", G_CALLBACK(soda_on_destroy), NULL);

    GtkWidget *web = webkit_web_view_new();
    gtk_container_add(GTK_CONTAINER(window), web);

    WebKitSettings *settings = webkit_web_view_get_settings(WEBKIT_WEB_VIEW(web));
    webkit_settings_set_enable_javascript(settings, TRUE);
    webkit_settings_set_enable_developer_extras(settings, FALSE);
    webkit_settings_set_enable_write_console_messages_to_stdout(settings, TRUE);
    webkit_settings_set_user_agent(settings, "SodaDlcLauncher/1.0 (Linux)");

    webkit_web_view_load_uri(WEBKIT_WEB_VIEW(web), url);
    gtk_widget_show_all(window);
    gtk_main();
}
*/
import "C"

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"unsafe"
)

//go:embed assets
var assets embed.FS

func extractIcon(tmpDir string) string {
	data, err := assets.ReadFile("assets/logo.png")
	if err != nil {
		return ""
	}
	path := filepath.Join(tmpDir, "logo.png")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return ""
	}
	return path
}

func main() {
	runtime.LockOSThread()

	sub, err := fs.Sub(assets, "assets")
	if err != nil {
		fmt.Fprintln(os.Stderr, "assets:", err)
		os.Exit(1)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintln(os.Stderr, "listen:", err)
		os.Exit(1)
	}
	server := &http.Server{Handler: http.FileServer(http.FS(sub))}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			fmt.Fprintln(os.Stderr, "server:", err)
		}
	}()

	port := listener.Addr().(*net.TCPAddr).Port
	pageURL := fmt.Sprintf("http://127.0.0.1:%d/launcher.html", port)
	if override := os.Getenv("SODA_SERVER"); override != "" {
		pageURL += "?server=" + url.QueryEscape(override)
	}

	tmpDir, err := os.MkdirTemp("", "sodalauncher-")
	if err != nil {
		tmpDir = ""
	}
	iconPath := ""
	if tmpDir != "" {
		iconPath = extractIcon(tmpDir)
		defer os.RemoveAll(tmpDir)
	}

	cURL := C.CString(pageURL)
	defer C.free(unsafe.Pointer(cURL))
	cTitle := C.CString("SodaDlc Launcher")
	defer C.free(unsafe.Pointer(cTitle))
	cIcon := C.CString(iconPath)
	defer C.free(unsafe.Pointer(cIcon))

	C.soda_run(cURL, cIcon, cTitle, 540, 820)
}
