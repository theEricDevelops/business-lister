import os
import dotenv
import psycopg2
import logging
from pydo import Client

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

dotenv.load_dotenv('.env')
client = Client(token=os.getenv('DIGITALOCEAN_TOKEN'))

class DBUser:
    def __init__(self, args):
        if isinstance(args, dict) and 'user' in args:
            self.username = args['user']['name']
            self.password = args['user']['password']
            self.role = args.get('role', 'normal')
        else:
            # Handling for when a user object is directly passed
            self.username = args.username if hasattr(args, 'username') else None
            self.password = args.password if hasattr(args, 'password') else None
            self.role = args.role if hasattr(args, 'role') else 'normal'

class DBConn:
    def __init__(self, conn, db_name=None, user=None):
        self.host = conn.get('host', 'localhost')
        self.ca = f"&sslrootcert={conn['ca']['certificate']}" if 'ca' in conn else ''
        self.sslmode = "sslmode=require" if conn.get('ssl', False) else ''
        self.port = conn.get('port', 5432)
        self.protocol = conn.get('protocol', 'postgresql')

        if user:
            self.user = user.username
            self.password = user.password
        else:
            self.user = conn.get('user', '')
            self.password = conn.get('password', '')
        self.db_name = db_name if db_name else conn.get('database', '')

        self.conn_str = self.create_conn_string()

    def create_conn_string(self):
        conn_parts = [self.sslmode]
        if self.ca:
            conn_parts.append(self.ca)

        params = "&".join(filter(None, conn_parts))
        if params:
            params = "?" + params
        return f"{self.protocol}://{self.user}:{self.password}@{self.host}:{self.port}/{self.db_name}{params}"

    def connect(self):
        logger.info(f"Connecting to database: {self.db_name} as user: {self.user}")
        conn = psycopg2.connect(self.conn_str)
        return conn

# Function to execute and log SQL queries
def execute_query(cursor, query, description=None):
    """Execute a query and log it"""
    if description:
        logger.info(f"Executing: {description}")
    logger.info(f"SQL: {query}")
    cursor.execute(query)
    return cursor

db_name = 'iicrc_listings'
db_user_name = 'iicrc_listings'

# Get the database cluster(s)
clusters = client.databases.list_clusters()
cluster = clusters['databases'][0]

# Get the database user info
user_info = client.databases.get_user(cluster['id'], db_user_name)
user = DBUser(user_info)

logger.info(f"User: {user.username}:{'*' * len(user.password)}")

# Get the certificate if needed
db_tls_ca = client.databases.get_ca(cluster['id'])['ca']['certificate']

# Create connection objects
db_default_conn = DBConn(cluster['connection'])
db_conn = DBConn(cluster['connection'], db_name, user=user)

logger.info(f"Default Connection: {db_default_conn.conn_str.replace(db_default_conn.password, '*' * len(db_default_conn.password))}")
logger.info(f"User Connection: {db_conn.conn_str.replace(db_conn.password, '*' * len(db_conn.password))}")

try:
    # First connection - grant database-level privileges
    connection = db_default_conn.connect()
    connection.autocommit = True
    cursor = connection.cursor()

    # Grant database privileges
    query = f"GRANT ALL PRIVILEGES ON DATABASE {db_name} TO {db_user_name};"
    execute_query(cursor, query, "Granting database privileges")
    logger.info(f"Granted database privileges on {db_name} to {db_user_name}")

    # Connect to the specific database to set schema permissions
    cursor.close()
    connection.close()
    logger.info("Closed default connection")

    # Connect as admin to the target database
    admin_conn = DBConn(cluster['connection'], db_name)
    admin_connection = admin_conn.connect()
    admin_connection.autocommit = True
    admin_cursor = admin_connection.cursor()

    # These are the critical commands for schema permissions
    schema_queries = [
        # Grant usage on schema
        f"GRANT USAGE ON SCHEMA public TO {db_user_name};",

        # Grant privileges on all existing objects
        f"GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO {db_user_name};",
        f"GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO {db_user_name};",
        f"GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO {db_user_name};",

        # Grant create permission on schema
        f"GRANT CREATE ON SCHEMA public TO {db_user_name};",

        # Set future privileges (for tables created later)
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO {db_user_name};",
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO {db_user_name};",
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO {db_user_name};",
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TYPES TO {db_user_name};",

        # Make the user the owner of the public schema
        f"ALTER SCHEMA public OWNER TO {db_user_name};"
    ]

    for i, query in enumerate(schema_queries):
        execute_query(admin_cursor, query, f"Schema privilege grant #{i+1}")

    admin_cursor.close()
    admin_connection.close()
    logger.info("Closed admin connection to target database")

    # Test the privileges
    logger.info("Testing the granted privileges...")
    try:
        test_conn = db_conn.connect()
        test_conn.autocommit = True
        test_cursor = test_conn.cursor()

        # Test table creation
        test_cursor.execute("CREATE TABLE IF NOT EXISTS privilege_test (id SERIAL PRIMARY KEY, data TEXT)")
        logger.info("✓ Created table successfully")

        # Test data insertion
        test_cursor.execute("INSERT INTO privilege_test (data) VALUES ('Test successful')")
        logger.info("✓ Inserted data successfully")

        # Test data retrieval
        test_cursor.execute("SELECT * FROM privilege_test")
        result = test_cursor.fetchone()
        logger.info(f"✓ Retrieved data successfully: {result}")

        # Clean up
        test_cursor.execute("DROP TABLE privilege_test")
        logger.info("✓ Dropped test table successfully")

        test_cursor.close()
        test_conn.close()
        logger.info("All privilege tests passed! User has full access to the database.")
    except Exception as e:
        logger.error(f"Privilege test failed: {e}", exc_info=True)
except Exception as e:
    logger.error(f"Error granting database privileges: {e}", exc_info=True)
finally:
    logger.info("Completed Script")