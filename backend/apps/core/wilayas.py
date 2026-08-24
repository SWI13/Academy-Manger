"""
The 58 wilayas of Algeria, as a fixed choice list.

A CharField of free text would let "Alger", "alger", "Algiers" and "16" all
mean the same place, and no report could group by it. The stored value is the
two-digit official code, which is stable - the names occasionally change
transliteration, the codes do not.

Includes the ten wilayas created in the 2019 reform (49-58), which older lists
omit.
"""

from django.db import models


class Wilaya(models.TextChoices):
    ADRAR = "01", "Adrar"
    CHLEF = "02", "Chlef"
    LAGHOUAT = "03", "Laghouat"
    OUM_EL_BOUAGHI = "04", "Oum El Bouaghi"
    BATNA = "05", "Batna"
    BEJAIA = "06", "Béjaïa"
    BISKRA = "07", "Biskra"
    BECHAR = "08", "Béchar"
    BLIDA = "09", "Blida"
    BOUIRA = "10", "Bouira"
    TAMANRASSET = "11", "Tamanrasset"
    TEBESSA = "12", "Tébessa"
    TLEMCEN = "13", "Tlemcen"
    TIARET = "14", "Tiaret"
    TIZI_OUZOU = "15", "Tizi Ouzou"
    ALGER = "16", "Alger"
    DJELFA = "17", "Djelfa"
    JIJEL = "18", "Jijel"
    SETIF = "19", "Sétif"
    SAIDA = "20", "Saïda"
    SKIKDA = "21", "Skikda"
    SIDI_BEL_ABBES = "22", "Sidi Bel Abbès"
    ANNABA = "23", "Annaba"
    GUELMA = "24", "Guelma"
    CONSTANTINE = "25", "Constantine"
    MEDEA = "26", "Médéa"
    MOSTAGANEM = "27", "Mostaganem"
    MSILA = "28", "M'Sila"
    MASCARA = "29", "Mascara"
    OUARGLA = "30", "Ouargla"
    ORAN = "31", "Oran"
    EL_BAYADH = "32", "El Bayadh"
    ILLIZI = "33", "Illizi"
    BORDJ_BOU_ARRERIDJ = "34", "Bordj Bou Arréridj"
    BOUMERDES = "35", "Boumerdès"
    EL_TARF = "36", "El Tarf"
    TINDOUF = "37", "Tindouf"
    TISSEMSILT = "38", "Tissemsilt"
    EL_OUED = "39", "El Oued"
    KHENCHELA = "40", "Khenchela"
    SOUK_AHRAS = "41", "Souk Ahras"
    TIPAZA = "42", "Tipaza"
    MILA = "43", "Mila"
    AIN_DEFLA = "44", "Aïn Defla"
    NAAMA = "45", "Naâma"
    AIN_TEMOUCHENT = "46", "Aïn Témouchent"
    GHARDAIA = "47", "Ghardaïa"
    RELIZANE = "48", "Relizane"
    TIMIMOUN = "49", "Timimoun"
    BORDJ_BADJI_MOKHTAR = "50", "Bordj Badji Mokhtar"
    OULED_DJELLAL = "51", "Ouled Djellal"
    BENI_ABBES = "52", "Béni Abbès"
    IN_SALAH = "53", "In Salah"
    IN_GUEZZAM = "54", "In Guezzam"
    TOUGGOURT = "55", "Touggourt"
    DJANET = "56", "Djanet"
    EL_MGHAIR = "57", "El M'Ghair"
    EL_MENIAA = "58", "El Meniaa"
