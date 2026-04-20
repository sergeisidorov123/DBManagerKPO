import tkinter as tk
from tkinter import ttk, simpledialog, messagebox
from .db import SessionLocal
from .models import Artist, Song, Tuning


class LoginDialog(simpledialog.Dialog):
    def body(self, master):
        tk.Label(master, text="Username:").grid(row=0)
        tk.Label(master, text="Password:").grid(row=1)
        self.e1 = tk.Entry(master)
        self.e2 = tk.Entry(master, show="*")
        self.e1.grid(row=0, column=1)
        self.e2.grid(row=1, column=1)
        return self.e1

    def apply(self):
        self.result = (self.e1.get(), self.e2.get())


class MainApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Guitar Config Manager")
        self.geometry("700x500")
        self.db = SessionLocal()

        self.tree = ttk.Treeview(self)
        self.tree.pack(fill=tk.BOTH, expand=True)
        self.tree['columns'] = ("type",)
        self.tree.column("type", width=120)
        self.tree.heading("type", text="Type")

        self.tree.bind("<Button-3>", self._on_right_click)

        self._context_menu = tk.Menu(self, tearoff=0)
        self.load_tree()

    def load_tree(self):
        self.tree.delete(*self.tree.get_children())
        for artist in self.db.query(Artist).order_by(Artist.name).all():
            a_id = self.tree.insert("", "end", text=artist.name, values=("artist",), tags=(f"artist:{artist.id}",))
            for song in artist.songs:
                s_id = self.tree.insert(a_id, "end", text=song.title, values=("song",), tags=(f"song:{song.id}",))
                for tuning in song.tunings:
                    self.tree.insert(s_id, "end", text=tuning.name, values=("tuning",), tags=(f"tuning:{tuning.id}",))

    def _on_right_click(self, event):
        item = self.tree.identify_row(event.y)
        self._context_menu.delete(0, tk.END)
        if not item:
            self._context_menu.add_command(label="Add Artist", command=self.add_artist)
        else:
            typ = self.tree.set(item, "type")
            if typ == "artist":
                self._context_menu.add_command(label="Add Song", command=lambda i=item: self.add_song(i))
                self._context_menu.add_command(label="Edit Artist", command=lambda i=item: self.edit_artist(i))
                self._context_menu.add_command(label="Delete Artist", command=lambda i=item: self.delete_artist(i))
            elif typ == "song":
                self._context_menu.add_command(label="Add Tuning", command=lambda i=item: self.add_tuning(i))
                self._context_menu.add_command(label="Edit Song", command=lambda i=item: self.edit_song(i))
                self._context_menu.add_command(label="Delete Song", command=lambda i=item: self.delete_song(i))
            elif typ == "tuning":
                self._context_menu.add_command(label="Edit Tuning", command=lambda i=item: self.edit_tuning(i))
                self._context_menu.add_command(label="Delete Tuning", command=lambda i=item: self.delete_tuning(i))

        try:
            self._context_menu.tk_popup(event.x_root, event.y_root)
        finally:
            self._context_menu.grab_release()

    def _get_id_from_tag(self, item, prefix):
        tags = self.tree.item(item, "tags")
        for t in tags:
            if t.startswith(prefix+":"):
                return int(t.split(":",1)[1])
        return None

    def add_artist(self):
        name = simpledialog.askstring("Add Artist", "Artist name:", parent=self)
        if name:
            a = Artist(name=name)
            self.db.add(a); self.db.commit()
            self.load_tree()

    def edit_artist(self, item):
        aid = self._get_id_from_tag(item, "artist")
        a = self.db.query(Artist).get(aid)
        if not a:
            return
        name = simpledialog.askstring("Edit Artist", "Artist name:", initialvalue=a.name, parent=self)
        if name:
            a.name = name; self.db.commit(); self.load_tree()

    def delete_artist(self, item):
        aid = self._get_id_from_tag(item, "artist")
        a = self.db.query(Artist).get(aid)
        if not a:
            return
        if messagebox.askyesno("Delete", f"Delete artist '{a.name}' and all songs?", parent=self):
            self.db.delete(a); self.db.commit(); self.load_tree()

    def add_song(self, item):
        aid = self._get_id_from_tag(item, "artist")
        title = simpledialog.askstring("Add Song", "Song title:", parent=self)
        if title:
            s = Song(title=title, artist_id=aid)
            self.db.add(s); self.db.commit(); self.load_tree()

    def edit_song(self, item):
        sid = self._get_id_from_tag(item, "song")
        s = self.db.query(Song).get(sid)
        if not s:
            return
        title = simpledialog.askstring("Edit Song", "Song title:", initialvalue=s.title, parent=self)
        if title:
            s.title = title; self.db.commit(); self.load_tree()

    def delete_song(self, item):
        sid = self._get_id_from_tag(item, "song")
        s = self.db.query(Song).get(sid)
        if not s:
            return
        if messagebox.askyesno("Delete", f"Delete song '{s.title}' and its tunings?", parent=self):
            self.db.delete(s); self.db.commit(); self.load_tree()

    def add_tuning(self, item):
        sid = self._get_id_from_tag(item, "song")
        name = simpledialog.askstring("Add Tuning", "Tuning name:", parent=self)
        notes = simpledialog.askstring("Add Tuning", "Notes/strings (optional):", parent=self)
        if name:
            t = Tuning(name=name, notes=notes, song_id=sid)
            self.db.add(t); self.db.commit(); self.load_tree()

    def edit_tuning(self, item):
        tid = self._get_id_from_tag(item, "tuning")
        t = self.db.query(Tuning).get(tid)
        if not t:
            return
        name = simpledialog.askstring("Edit Tuning", "Tuning name:", initialvalue=t.name, parent=self)
        notes = simpledialog.askstring("Edit Tuning", "Notes/strings:", initialvalue=t.notes, parent=self)
        if name:
            t.name = name; t.notes = notes; self.db.commit(); self.load_tree()

    def delete_tuning(self, item):
        tid = self._get_id_from_tag(item, "tuning")
        t = self.db.query(Tuning).get(tid)
        if not t:
            return
        if messagebox.askyesno("Delete", f"Delete tuning '{t.name}'?", parent=self):
            self.db.delete(t); self.db.commit(); self.load_tree()
