FROM azul/zulu-openjdk:21
LABEL org.opencontainers.image.source="https://github.com/catchsudheera/brs"
ADD target/backend.jar  backend.jar
ENTRYPOINT ["java","-jar","backend.jar"]
