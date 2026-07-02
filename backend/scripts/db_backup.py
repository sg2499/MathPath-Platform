import os
import subprocess
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables (to find DATABASE_URL if running locally)
load_dotenv()

def backup_database():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable is not set.")
        return

    # Parse the database URL to pass to pg_dump
    # Format typically: postgresql://user:password@host:port/dbname
    
    # Create backups directory if it doesn't exist
    backup_dir = Path("backups")
    backup_dir.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_file = backup_dir / f"mathpath_db_backup_{timestamp}.sql"
    
    print(f"Starting database backup to {backup_file}...")
    
    try:
        # We use pg_dump to export the database. 
        # Note: In production environments, this script would run as a cron job
        # and could automatically upload the output file to AWS S3.
        command = [
            "pg_dump",
            "--dbname", database_url,
            "--no-owner",
            "--no-acl",
            "--clean",
            "-f", str(backup_file)
        ]
        
        # Execute the command
        process = subprocess.run(command, capture_output=True, text=True)
        
        if process.returncode == 0:
            print("✅ Database backup completed successfully!")
            print(f"📁 Backup saved to: {backup_file}")
            
            # Optional: compress the backup
            import gzip
            import shutil
            with open(backup_file, 'rb') as f_in:
                with gzip.open(f"{backup_file}.gz", 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            
            # Remove uncompressed file
            backup_file.unlink()
            print(f"🗜️ Compressed backup saved to: {backup_file}.gz")
            
        else:
            print("❌ Error during database backup:")
            print(process.stderr)
            
    except Exception as e:
        print(f"❌ Failed to run backup: {str(e)}")

if __name__ == "__main__":
    backup_database()
