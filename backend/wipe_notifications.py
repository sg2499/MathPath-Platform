import sqlite3
import sys

def wipe_notifications():
    try:
        conn = sqlite3.connect('mathpath.db')
        c = conn.cursor()
        
        # Find user
        c.execute("SELECT id, full_name, role FROM users")
        users = c.fetchall()
        for u in users:
            print(f"ID: {u[0]}, Name: {u[1]}, Role: {u[2]}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == '__main__':
    wipe_notifications()
