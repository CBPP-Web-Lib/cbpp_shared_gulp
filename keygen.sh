openssl genrsa -out ca.key 2048
openssl req -new -x509 -days 9999 -key ca.key -subj "/C=US/O=CBPP/CN=CBPP" -out ca.crt
openssl req -newkey rsa:2048 -nodes -keyout localhost.key -subj "/C=US/O=CBPP/CN=localhost" -out localhost.csr
openssl x509 -req -extfile <(printf "subjectAltName=DNS:localhost") -days 9999 -in localhost.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out localhost.crt
openssl req -newkey rsa:2048 -nodes -keyout vm-localhost.key -subj "/C=US/O=CBPP/CN=localhost" -out vm-localhost.csr
openssl x509 -req -extfile <(printf "subjectAltName=DNS:localhost") -days 9999 -in vm-localhost.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out vm-localhost.crt